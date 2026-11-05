import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setConfigValue, unsetConfigValue } from './edit.js'
import { resolveConfig } from './resolve.js'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atc-config-'))
  file = join(dir, 'config.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const read = () => JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>

describe('config edits', () => {
  it('types, checks and writes a value, keeping unknown keys', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, future: { x: 1 } }))
    const current = resolveConfig({ fileText: readFileSync(file, 'utf8'), env: {} })
    expect(await setConfigValue(file, current, 'api.trustedHosts', 'a.lan, b.lan')).toEqual({
      key: 'api.trustedHosts',
      value: ['a.lan', 'b.lan'],
      overriddenByEnv: false,
    })
    expect(read()['api']?.['trustedHosts']).toEqual(['a.lan', 'b.lan'])
    expect(read()['future']).toEqual({ x: 1 })
  })

  it('refuses an unknown key and a value the field does not accept', async () => {
    const current = resolveConfig({ env: {} })
    await expect(setConfigValue(file, current, 'api.nope', '1')).rejects.toMatchObject({ code: 'ATC_USAGE' })
    await expect(setConfigValue(file, current, 'api.port', '70000')).rejects.toMatchObject({
      code: 'ATC_CONFIG_INVALID',
    })
  })

  it('says when an environment variable overrides the key, and resets to the default', async () => {
    const current = resolveConfig({ env: { ATC_API_PORT: '9000' } })
    expect((await setConfigValue(file, current, 'api.port', '1400')).overriddenByEnv).toBe(true)
    const after = resolveConfig({ fileText: readFileSync(file, 'utf8'), env: {} })
    expect(await unsetConfigValue(file, after, 'api.port')).toEqual({
      key: 'api.port',
      value: 1339,
      overriddenByEnv: false,
    })
    expect(read()['api']?.['port']).toBe(1339)
  })
})
