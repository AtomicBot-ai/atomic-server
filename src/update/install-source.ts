/**
 * Who installed this atc. A Linux package (deb, rpm, the AUR's atc-bin) puts the binary at /usr/bin/atc
 * and a marker naming itself beside it; the package manager owns that file and updates it, so
 * `atc update` must not rename over it (dpkg's and rpm's database would no longer match the disk). A
 * copy anywhere else — the installer's ~/.local/bin — stays the installer's, even with a package
 * installed on the same machine.
 */

export const PACKAGE_MARKER = '/usr/lib/atc/install-source'
export const PACKAGED_BINARY = '/usr/bin/atc'

export const INSTALL_SOURCES = ['deb', 'rpm', 'aur'] as const
export type InstallSource = (typeof INSTALL_SOURCES)[number]

/** How this binary got here: a package, a released binary (installer or by hand), or the source tree. */
export type InstallKind = InstallSource | 'release' | 'source'

const LABELS: Record<InstallKind, string> = {
  deb: 'the deb package',
  rpm: 'the rpm package',
  aur: 'the AUR package atc-bin',
  release: 'a release binary',
  source: 'the source tree',
}

const UPGRADE: Record<InstallSource, string> = {
  deb: 'sudo apt update && sudo apt install --only-upgrade atc',
  rpm: 'sudo dnf upgrade atc',
  aur: 'yay -Syu atc-bin (or your AUR helper)',
}

/** The package that installed the binary at `execPath`, or undefined when no package did. */
export async function readInstallSource(
  readFile: (path: string) => Promise<string | undefined>,
  platform: NodeJS.Platform,
  execPath: string
): Promise<InstallSource | undefined> {
  if (platform !== 'linux' || execPath !== PACKAGED_BINARY) return undefined
  const marker = (await readFile(PACKAGE_MARKER).catch(() => undefined))?.trim()
  return INSTALL_SOURCES.find((s) => s === marker)
}

export function installKind(source: InstallSource | undefined, builtFor: string | undefined): InstallKind {
  return source ?? (builtFor ? 'release' : 'source')
}

export interface InstallInfo {
  path: string
  kind: InstallKind
}

/** Where the running atc lives and how it got there (`atc doctor`). */
export async function detectInstall(
  readFile: (path: string) => Promise<string | undefined>,
  platform: NodeJS.Platform,
  execPath: string,
  builtFor: string | undefined
): Promise<InstallInfo> {
  return {
    path: execPath,
    kind: installKind(await readInstallSource(readFile, platform, execPath), builtFor),
  }
}

export function installLabel(kind: InstallKind): string {
  return LABELS[kind]
}

/** The command that updates a packaged atc. */
export function packageUpgradeHint(source: InstallSource): string {
  return UPGRADE[source]
}
