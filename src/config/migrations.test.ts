import { describe, expect, it } from 'vitest'
import { migrateConfig } from './migrations.js'
import { CONFIG_VERSION } from './schema.js'

describe('migrateConfig', () => {
  it('passes the current version through and assumes version 1 when absent', () => {
    expect(migrateConfig({ version: CONFIG_VERSION, a: 1 })).toEqual({
      raw: { version: CONFIG_VERSION, a: 1 },
    })
    expect(migrateConfig({ a: 1 })).toEqual({ raw: { version: CONFIG_VERSION, a: 1 }, migratedFrom: 1 })
  })

  it.each([
    [
      'serve.engine becomes engines.default; the rest of serve is dropped',
      { version: 1, serve: { engine: 'mlx', model: 'x', ctxSize: 4096 }, api: { port: 1 } },
      { version: CONFIG_VERSION, engines: { default: 'mlx' }, api: { port: 1 } },
    ],
    [
      'engines.provider wins over serve.engine and is renamed',
      { version: 1, serve: { engine: 'mlx' }, engines: { provider: 'llamacpp', autoInstall: false } },
      { version: CONFIG_VERSION, engines: { default: 'llamacpp', autoInstall: false } },
    ],
    [
      'a file without either is left as it was',
      { version: 1, api: { port: 1 } },
      { version: CONFIG_VERSION, api: { port: 1 } },
    ],
  ])('1 → 2: %s', (_name, from, to) => {
    expect(migrateConfig(from)).toEqual({ raw: to, migratedFrom: 1 })
  })

  it.each([
    [
      'api.requireKey is dropped, the rest of api kept',
      { version: 3, api: { requireKey: false, port: 9 } },
      { api: { port: 9 } },
    ],
    ['an api without it is left as it was', { version: 3, api: { port: 9 } }, { api: { port: 9 } }],
    ['no api at all', { version: 3, tui: { mode: 'personal' } }, { tui: { mode: 'personal' } }],
  ])('3 → 4: %s', (_name, from, to) => {
    expect(migrateConfig(from)).toEqual({ raw: { version: CONFIG_VERSION, ...to }, migratedFrom: 3 })
  })

  it('refuses a newer file with an update hint', () => {
    expect(() => migrateConfig({ version: CONFIG_VERSION + 1 })).toThrow(/this atc understands/)
  })
})
