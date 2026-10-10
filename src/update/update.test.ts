import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSha256Sums } from './checksums.js'
import { ATC_REPO, checkForUpdate } from './release.js'
import { assetNameFor, planReplace } from './replace-plan.js'
import { compareSemver, isNewer, parseSemver } from './semver.js'

describe('semver', () => {
  it('parses and orders, pre-releases first', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
    expect(parseSemver('nope')).toBeUndefined()
    expect(isNewer('1.2.4', '1.2.3')).toBe(true)
    expect(isNewer('1.2.3-beta.1', '1.2.3')).toBe(false)
    expect(isNewer('1.2.3', '1.2.3-beta.1')).toBe(true)
    expect(compareSemver(parseSemver('1.0.0-beta.2')!, parseSemver('1.0.0-beta.10')!)).toBe(-1)
  })
})

describe('checksums', () => {
  it('reads sha256sum output', () => {
    expect(
      parseSha256Sums('ABCDEF' + 'a'.repeat(58) + '  atc-1-x\n' + 'b'.repeat(64) + ' *atc-1-y\nbad line\n')
    ).toEqual({
      'atc-1-x': 'abcdef' + 'a'.repeat(58),
      'atc-1-y': 'b'.repeat(64),
    })
  })
})

describe('replace plan', () => {
  it('renames in place on posix and moves aside on windows', () => {
    expect(planReplace('linux', '/usr/local/bin/atc', '/tmp/atc.new', 's').steps.map((s) => s.op)).toEqual([
      'chmod',
      'rename',
    ])
    const win = planReplace('win32', 'C:\\atc\\atc.exe', 'C:\\atc\\atc.new', '1')
    expect(win.steps[0]).toEqual({ op: 'rename', from: 'C:\\atc\\atc.exe', to: 'C:\\atc\\atc.exe.old-1' })
    expect(assetNameFor('0.1.0', 'linux', 'x64')).toBe('atc-0.1.0-x86_64-unknown-linux-gnu')
    expect(assetNameFor('0.1.0', 'win32', 'arm64')).toBe('atc-0.1.0-aarch64-pc-windows-msvc.exe')
  })
})

describe('checkForUpdate', () => {
  it('compares with the latest tag', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ tag_name: 'v0.2.0', html_url: 'u', assets: [] }), {
        status: 200,
      })) as unknown as typeof fetch
    expect(await checkForUpdate(fetchImpl, '0.1.0')).toEqual({
      current: '0.1.0',
      latest: '0.2.0',
      available: true,
      url: 'u',
    })
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(checkForUpdate(missing, '0.1.0')).rejects.toMatchObject({ code: 'ATC_UPDATE_FAILED' })
  })
})

describe('the repository releases come from', () => {
  it('is the one both installers default to', () => {
    const script = (name: string) => readFileSync(new URL(`../../scripts/${name}`, import.meta.url), 'utf8')
    expect(script('install.sh')).toContain(`REPO="\${ATC_REPO:-${ATC_REPO}}"`)
    expect(script('install.ps1')).toContain(`else { "${ATC_REPO}" }`)
  })
})
