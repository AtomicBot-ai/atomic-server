import { describe, expect, it } from 'vitest'
import { installKind, packageUpgradeHint, PACKAGE_MARKER, readInstallSource } from './install-source.js'

const marker = (body: string | undefined) => async (path: string) =>
  path === PACKAGE_MARKER ? body : undefined

describe('readInstallSource', () => {
  it.each([
    ['a deb install', 'linux', '/usr/bin/atc', 'deb\n', 'deb'],
    ['an rpm install', 'linux', '/usr/bin/atc', 'rpm', 'rpm'],
    ['an AUR install', 'linux', '/usr/bin/atc', ' aur \n', 'aur'],
    ['no marker', 'linux', '/usr/bin/atc', undefined, undefined],
    ['an unknown marker', 'linux', '/usr/bin/atc', 'snap', undefined],
    ['the installer copy beside a package', 'linux', '/home/u/.local/bin/atc', 'deb', undefined],
    ['another platform', 'darwin', '/usr/bin/atc', 'deb', undefined],
  ] as const)('%s', async (_name, platform, execPath, body, expected) => {
    expect(await readInstallSource(marker(body), platform, execPath)).toBe(expected)
  })

  it('treats an unreadable marker as no package', async () => {
    const failing = async () => {
      throw new Error('EACCES')
    }
    expect(await readInstallSource(failing, 'linux', '/usr/bin/atc')).toBeUndefined()
  })
})

describe('installKind', () => {
  it('prefers the package, then a release binary, then the source tree', () => {
    expect(installKind('rpm', 'x86_64-unknown-linux-gnu-baseline')).toBe('rpm')
    expect(installKind(undefined, 'x86_64-unknown-linux-gnu')).toBe('release')
    expect(installKind(undefined, undefined)).toBe('source')
  })
})

describe('packageUpgradeHint', () => {
  it('names the package manager', () => {
    expect(packageUpgradeHint('deb')).toContain('apt')
    expect(packageUpgradeHint('rpm')).toContain('dnf')
    expect(packageUpgradeHint('aur')).toContain('atc-bin')
  })
})
