// The Linux packages and their repository, the pure part: which release binary goes into which package,
// the package and AUR versions, the PKGBUILD, which releases the repository carries, its layout and the
// order it is uploaded in. `linux-packages.mjs` and `linux-repo.mjs` do the file system and the tools.

/** One package per architecture. x64 carries the baseline build: a package cannot pick by CPU. */
export const PACKAGE_TARGETS = [
  { triple: 'x86_64-unknown-linux-gnu-baseline', nfpm: 'amd64', deb: 'amd64', rpm: 'x86_64', node: 'x64' },
  { triple: 'aarch64-unknown-linux-gnu', nfpm: 'arm64', deb: 'arm64', rpm: 'aarch64', node: 'arm64' },
]

export const PACKAGE_FORMATS = ['deb', 'rpm']

/** Release assets the PKGBUILD downloads besides the binaries. */
export const LICENSE_FILES = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']

const STABLE = /^v?(\d+)\.(\d+)\.(\d+)$/
const PACKAGE_FILE = /^atc_.+\.(deb|rpm)$/

/**
 * `atc_<version>_<arch>.<format>`: an underscore, so no `atc-*` glob of the release workflow or the
 * installers (the binaries) ever matches a package.
 */
export function packageFileName(version, format, target) {
  return `atc_${version}_${target[format]}.${format}`
}

export function packageAssets(version) {
  return PACKAGE_FORMATS.flatMap((format) => PACKAGE_TARGETS.map((t) => packageFileName(version, format, t)))
}

/** The binary asset of a release, as the release workflow names it. */
export function binaryAsset(version, triple) {
  return `atc-${version}-${triple}`
}

/** pacman's pkgver allows no hyphen: 0.3.0-rc.1 → 0.3.0rc.1 (which still sorts before 0.3.0). */
export function archPkgver(version) {
  return version.replace(/^v/, '').replaceAll('-', '')
}

/** `sha256sum` output → { name: hash }. */
export function parseSha256Sums(text) {
  const sums = {}
  for (const line of text.split('\n')) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim())
    if (match) sums[match[2]] = match[1].toLowerCase()
  }
  return sums
}

/** packaging/PKGBUILD.in with this release's version, download base and checksums. */
export function renderPkgbuild(template, { version, sums, sourceBase }) {
  const sum = (name) => {
    const hash = sums[name]
    if (!hash) throw new Error(`SHA256SUMS does not list ${name}`)
    return hash
  }
  const [x64, arm64] = PACKAGE_TARGETS
  const values = {
    VERSION: version,
    PKGVER: archPkgver(version),
    SOURCE_BASE: sourceBase,
    SHA_LICENSES: LICENSE_FILES.map((f) => `'${sum(f)}'`).join(' '),
    SHA_X86_64: sum(binaryAsset(version, x64.triple)),
    SHA_AARCH64: sum(binaryAsset(version, arm64.triple)),
  }
  const out = template.replace(/@([A-Z0-9_]+)@/g, (match, key) => {
    if (!(key in values)) throw new Error(`PKGBUILD.in has an unknown placeholder ${match}`)
    return values[key]
  })
  return out
}

function stableVersion(tag) {
  const match = STABLE.exec(tag)
  return match ? match.slice(1).map(Number) : undefined
}

function compareDesc(a, b) {
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i]
  return 0
}

/**
 * The releases the repository carries: the newest `keep` published, stable releases that have packages
 * (GitHub's release JSON). Drafts and pre-releases never; releases from before the packages are skipped.
 */
export function selectReleases(releases, keep = 10) {
  return releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ tag: r.tag_name, parts: stableVersion(r.tag_name), assets: r.assets ?? [] }))
    .filter((r) => r.parts && r.assets.some((a) => PACKAGE_FILE.test(a.name)))
    .sort(compareDesc)
    .slice(0, keep)
    .map((r) => ({ tag: r.tag, version: r.parts.join('.') }))
}

/** Where a package file lives in the repository. */
export function repoPath(file) {
  if (file.endsWith('.deb')) return `deb/pool/main/a/atc/${file}`
  if (file.endsWith('.rpm')) return `rpm/packages/${file}`
  throw new Error(`not a package: ${file}`)
}

/** The dnf repository definition users download into /etc/yum.repos.d. */
export function renderRepoFile({ baseUrl, packageSignatures = true }) {
  return [
    '[atomic-chat]',
    'name=Atomic Chat',
    `baseurl=${baseUrl}/rpm`,
    'enabled=1',
    `gpgcheck=${packageSignatures ? 1 : 0}`,
    'repo_gpgcheck=1',
    `gpgkey=${baseUrl}/atomic-chat.asc`,
    '',
  ].join('\n')
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'no-cache'

/** Packages never change under a name; indexes and keys are checked on every request. */
export function cacheControl(path) {
  return PACKAGE_FILE.test(path.split('/').pop() ?? '') ? IMMUTABLE : REVALIDATE
}

const TYPES = [
  [/\.deb$/, 'application/vnd.debian.binary-package'],
  [/\.rpm$/, 'application/x-rpm'],
  [/\.gz$/, 'application/gzip'],
  [/\.xml$/, 'application/xml'],
  [/(^|\/)atomic-chat\.(asc|gpg)$/, 'application/pgp-keys'],
  [/(Release\.gpg|\.asc)$/, 'application/pgp-signature'],
]

export function contentType(path) {
  return TYPES.find(([pattern]) => pattern.test(path))?.[1] ?? 'text/plain; charset=utf-8'
}

/**
 * Upload order, so a client never sees an index that names a file not uploaded yet: packages, then the
 * indexes they are listed in, then what points at those (Release, InRelease, repomd.xml and their
 * signatures, the keys, the .repo file).
 */
function rank(path) {
  const name = path.split('/').pop() ?? ''
  if (PACKAGE_FILE.test(name)) return 0
  if (/^(Packages(\.gz)?)$/.test(name)) return 1
  if (path.startsWith('rpm/repodata/') && !name.startsWith('repomd.xml')) return 1
  return 2
}

/**
 * What to change in the bucket to make it `local`: upload new packages (an uploaded one is identical,
 * names are never reused), upload every index and key, then delete what is no longer listed.
 */
export function syncPlan(local, remote) {
  const remoteSet = new Set(remote)
  const localSet = new Set(local)
  const puts = local
    .filter((p) => rank(p) > 0 || !remoteSet.has(p))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((path) => ({ op: 'put', path, cacheControl: cacheControl(path) }))
  const deletes = remote
    .filter((p) => !localSet.has(p))
    .sort()
    .map((path) => ({ op: 'delete', path }))
  return [...puts, ...deletes]
}

/** The shell lines of the README block marked `<!-- install:<name> -->`, the instructions users follow. */
export function readmeInstallBlock(readme, name) {
  const marker = `<!-- install:${name} -->`
  const at = readme.indexOf(marker)
  if (at < 0) throw new Error(`README.md has no ${marker}`)
  const match = /```sh\n([\s\S]*?)```/.exec(readme.slice(at))
  if (!match) throw new Error(`README.md has no sh block after ${marker}`)
  return match[1]
}
