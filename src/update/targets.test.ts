import { describe, expect, it } from 'vitest'
import { TARGETS as SCRIPT_TARGETS } from '../../scripts/targets.mjs'
import { TARGETS, assetName, targetByTriple, targetFor } from './targets.js'

describe('release targets', () => {
  it('are the same table the build script compiles', () => {
    expect(SCRIPT_TARGETS).toEqual(TARGETS)
  })

  it('have unique Bun targets and triples, and one default per platform and CPU', () => {
    expect(new Set(TARGETS.map((t) => t.bun)).size).toBe(TARGETS.length)
    expect(new Set(TARGETS.map((t) => t.triple)).size).toBe(TARGETS.length)
    for (const t of TARGETS) expect(targetFor(t.platform, t.arch)?.variant).toBe('default')
  })

  it.each([
    ['linux', 'x64', 'default', 'atc-1.2.3-x86_64-unknown-linux-gnu'],
    ['linux', 'x64', 'baseline', 'atc-1.2.3-x86_64-unknown-linux-gnu-baseline'],
    ['linux', 'arm64', 'musl', 'atc-1.2.3-aarch64-unknown-linux-musl'],
    ['darwin', 'arm64', 'default', 'atc-1.2.3-aarch64-apple-darwin'],
    ['win32', 'x64', 'baseline', 'atc-1.2.3-x86_64-pc-windows-msvc-baseline.exe'],
    ['win32', 'arm64', 'default', 'atc-1.2.3-aarch64-pc-windows-msvc.exe'],
  ] as const)('%s %s %s → %s', (platform, arch, variant, name) => {
    expect(assetName('1.2.3', targetFor(platform, arch, variant)!)).toBe(name)
  })

  it('has nothing for what is not built', () => {
    expect(targetFor('darwin', 'x64', 'baseline')).toBeUndefined()
    expect(targetFor('freebsd', 'x64')).toBeUndefined()
    expect(targetByTriple('x86_64-unknown-linux-musl')?.variant).toBe('musl')
  })
})
