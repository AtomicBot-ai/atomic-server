import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { configDocument, readSecrets, readTextFile, writeConfigFile, writeSecrets } from './file.js'
import { defaultConfig } from './schema.js'

const dir = mkdtempSync(join(tmpdir(), 'atc-config-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('config files', () => {
  it('writes the config atomically and round-trips unknown keys', async () => {
    const path = join(dir, 'nested', 'config.json')
    const config = defaultConfig()
    config.api.port = 4000
    await writeConfigFile(path, config, { custom: { keep: true }, api: { extra: 1 } })
    const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>
    expect(doc['api']!['port']).toBe(4000)
    expect(doc['api']!['extra']).toBe(1)
    expect(doc['custom']).toEqual({ keep: true })
    expect(await readTextFile(join(dir, 'missing'))).toBeUndefined()
    expect(configDocument(config, {})['version']).toBe(3)
  })

  it('keeps secrets private', async () => {
    const path = join(dir, 'secrets.json')
    await writeSecrets(path, { hfToken: 'hf_x' })
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(await readSecrets(path)).toEqual({ hfToken: 'hf_x' })
    expect(await readSecrets(join(dir, 'none'))).toEqual({})
  })
})
