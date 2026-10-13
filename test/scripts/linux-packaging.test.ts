import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  archPkgver,
  binaryAsset,
  glibcFloor,
  cacheControl,
  contentType,
  packageAssets,
  PACKAGE_TARGETS,
  readmeInstallBlock,
  renderPkgbuild,
  renderRepoFile,
  repoPath,
  selectReleases,
  syncPlan,
} from '../../scripts/linux-packaging.mjs'
import type { GithubRelease } from '../../scripts/linux-packaging.mjs'
import { TARGETS } from '../../scripts/targets.mjs'

describe('package assets', () => {
  it('names one deb and one rpm per architecture, none matching the binaries’ atc-* glob', () => {
    const names = packageAssets('0.3.0')
    expect(names).toEqual([
      'atc_0.3.0_amd64.deb',
      'atc_0.3.0_arm64.deb',
      'atc_0.3.0_x86_64.rpm',
      'atc_0.3.0_aarch64.rpm',
    ])
    for (const name of names) expect(name.startsWith('atc-')).toBe(false)
  })

  it('packages release targets only: the x64 baseline build and the arm64 build', () => {
    const triples = new Set(TARGETS.map((t) => t.triple))
    for (const t of PACKAGE_TARGETS) expect(triples.has(t.triple)).toBe(true)
    expect(PACKAGE_TARGETS.map((t) => t.triple)).toEqual([
      'x86_64-unknown-linux-gnu-baseline',
      'aarch64-unknown-linux-gnu',
    ])
  })
})

describe('glibcFloor', () => {
  // readelf -V of a Bun 1.3.10 Linux build (abridged).
  const readelf = [
    "Version needs section '.gnu.version_r' contains 2 entries:",
    '  0x0000: Version: 1  File: libc.so.6  Cnt: 12',
    '  0x0010:   Name: GLIBC_2.2.5  Flags: none  Version: 2',
    '  0x0130:   Name: GLIBC_2.18  Flags: none  Version: 23',
    '  0x0140:   Name: GLIBC_2.24  Flags: none  Version: 8',
    '  0x0150:   Name: GLIBC_2.25  Flags: none  Version: 22',
    '  0x0160:   Name: GLIBC_2.34  Flags: WEAK  Version: 24',
  ].join('\n')

  it('is the newest required version, compared as numbers, ignoring WEAK ones', () => {
    expect(glibcFloor(readelf)).toBe('2.25')
  })

  it('refuses output with no glibc reference', () => {
    expect(() => glibcFloor('no version info')).toThrow('no GLIBC_')
  })
})

describe('archPkgver', () => {
  it.each([
    ['0.3.0', '0.3.0'],
    ['v1.2.3', '1.2.3'],
    ['0.3.0-rc.1', '0.3.0rc.1'],
  ])('%s → %s', (version, pkgver) => {
    expect(archPkgver(version)).toBe(pkgver)
  })
})

describe('renderPkgbuild', () => {
  const template = readFileSync('packaging/PKGBUILD.in', 'utf8')
  const hash = (c: string) => c.repeat(64)
  const sums = {
    'LICENSE': hash('1'),
    'NOTICE': hash('2'),
    'THIRD_PARTY_NOTICES.md': hash('3'),
    [binaryAsset('0.3.0', 'x86_64-unknown-linux-gnu-baseline')]: hash('4'),
    [binaryAsset('0.3.0', 'aarch64-unknown-linux-gnu')]: hash('5'),
  }

  it('fills the version, the download base and every checksum', () => {
    const text = renderPkgbuild(template, { version: '0.3.0', sums, sourceBase: 'https://dl/v0.3.0' })
    expect(text).not.toMatch(/@[A-Z0-9_]+@/)
    expect(text).toContain('pkgver=0.3.0\n')
    expect(text).toContain("_base='https://dl/v0.3.0'")
    expect(text).toContain(`sha256sums=('${hash('1')}' '${hash('2')}' '${hash('3')}')`)
    expect(text).toContain(`sha256sums_x86_64=('${hash('4')}')`)
    expect(text).toContain(`sha256sums_aarch64=('${hash('5')}')`)
  })

  it('writes LF line ends from a CRLF template', () => {
    const crlf = template.replace(/\r?\n/g, '\r\n')
    const text = renderPkgbuild(crlf, { version: '0.3.0', sums, sourceBase: 'x' })
    expect(text).not.toContain('\r')
  })

  it('refuses a release whose SHA256SUMS misses a file', () => {
    const { NOTICE: _, ...partial } = sums
    expect(() => renderPkgbuild(template, { version: '0.3.0', sums: partial, sourceBase: 'x' })).toThrow(
      'does not list NOTICE'
    )
  })
})

describe('selectReleases', () => {
  const release = (tag: string, over: Partial<GithubRelease> = {}): GithubRelease => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{ name: `atc_${tag.slice(1)}_amd64.deb` }],
    ...over,
  })

  it('keeps the newest published stable releases that carry packages, newest first', () => {
    const releases = [
      release('v0.9.0'),
      release('v0.10.0'),
      release('v0.11.0', { draft: true }),
      release('v0.11.0-rc.1', { prerelease: true }),
      release('v0.2.0', { assets: [{ name: 'atc-0.2.0-x86_64-unknown-linux-gnu' }] }),
      release('v0.8.0'),
    ]
    expect(selectReleases(releases, 2)).toEqual([
      { tag: 'v0.10.0', version: '0.10.0' },
      { tag: 'v0.9.0', version: '0.9.0' },
    ])
    expect(selectReleases(releases).map((r) => r.tag)).toEqual(['v0.10.0', 'v0.9.0', 'v0.8.0'])
  })
})

describe('repository layout', () => {
  it('puts debs in the pool and rpms beside the dnf metadata', () => {
    expect(repoPath('atc_0.3.0_amd64.deb')).toBe('deb/pool/main/a/atc/atc_0.3.0_amd64.deb')
    expect(repoPath('atc_0.3.0_x86_64.rpm')).toBe('rpm/packages/atc_0.3.0_x86_64.rpm')
    expect(() => repoPath('SHA256SUMS')).toThrow('not a package')
  })

  it('writes a .repo that checks the metadata and, when signed, the packages', () => {
    const repo = renderRepoFile({ baseUrl: 'https://packages.atomic.chat' })
    expect(repo).toContain('baseurl=https://packages.atomic.chat/rpm\n')
    expect(repo).toContain('gpgcheck=1\nrepo_gpgcheck=1\n')
    expect(repo).toContain('gpgkey=https://packages.atomic.chat/atomic-chat.asc\n')
    expect(renderRepoFile({ baseUrl: 'http://x', packageSignatures: false })).toContain('gpgcheck=0\n')
  })

  it.each([
    ['deb/pool/main/a/atc/atc_0.3.0_amd64.deb', 'immutable', 'application/vnd.debian.binary-package'],
    ['rpm/packages/atc_0.3.0_x86_64.rpm', 'immutable', 'application/x-rpm'],
    ['deb/dists/stable/InRelease', 'no-cache', 'text/plain; charset=utf-8'],
    ['deb/dists/stable/Release.gpg', 'no-cache', 'application/pgp-signature'],
    ['deb/dists/stable/main/binary-amd64/Packages.gz', 'no-cache', 'application/gzip'],
    ['rpm/repodata/repomd.xml', 'no-cache', 'application/xml'],
    ['rpm/repodata/repomd.xml.asc', 'no-cache', 'application/pgp-signature'],
    ['atomic-chat.asc', 'no-cache', 'application/pgp-keys'],
    ['atomic-chat.gpg', 'no-cache', 'application/pgp-keys'],
  ])('%s: %s, %s', (path, cache, type) => {
    expect(cacheControl(path)).toContain(cache)
    expect(contentType(path)).toBe(type)
  })
})

describe('syncPlan', () => {
  it('uploads packages, then indexes, then what points at them, and deletes last', () => {
    const local = [
      'atomic-chat.asc',
      'deb/dists/stable/InRelease',
      'deb/dists/stable/main/binary-amd64/Packages',
      'deb/pool/main/a/atc/atc_0.4.0_amd64.deb',
      'deb/pool/main/a/atc/atc_0.3.0_amd64.deb',
      'rpm/repodata/repomd.xml',
      'rpm/repodata/bbb-primary.xml.gz',
    ]
    const remote = [
      'deb/pool/main/a/atc/atc_0.3.0_amd64.deb',
      'deb/pool/main/a/atc/atc_0.1.0_amd64.deb',
      'rpm/repodata/aaa-primary.xml.gz',
      'rpm/repodata/repomd.xml',
    ]
    expect(syncPlan(local, remote).map((s) => `${s.op} ${s.path}`)).toEqual([
      'put deb/pool/main/a/atc/atc_0.4.0_amd64.deb',
      'put deb/dists/stable/main/binary-amd64/Packages',
      'put rpm/repodata/bbb-primary.xml.gz',
      'put atomic-chat.asc',
      'put deb/dists/stable/InRelease',
      'put rpm/repodata/repomd.xml',
      'delete deb/pool/main/a/atc/atc_0.1.0_amd64.deb',
      'delete rpm/repodata/aaa-primary.xml.gz',
    ])
  })
})

describe('readmeInstallBlock', () => {
  it('returns the shell block after the marker', () => {
    const readme = 'x\n<!-- install:apt -->\n\n```sh\nsudo apt install atc\n```\n'
    expect(readmeInstallBlock(readme, 'apt')).toBe('sudo apt install atc\n')
    expect(() => readmeInstallBlock(readme, 'dnf')).toThrow('no <!-- install:dnf -->')
  })

  it('reads a CRLF checkout (Windows) as plain lines', () => {
    const readme = '<!-- install:apt -->\r\n\r\n```sh\r\nsudo apt install atc\r\n```\r\n'
    expect(readmeInstallBlock(readme, 'apt')).toBe('sudo apt install atc\n')
  })

  it.each(['apt', 'dnf'])('finds the %s instructions in README.md', (name) => {
    expect(readmeInstallBlock(readFileSync('README.md', 'utf8'), name)).toContain('packages.atomic.chat')
  })
})
