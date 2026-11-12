import { describe, expect, it } from 'vitest'
import { migrateConfig } from './migrations.js'
import { validateConfig } from './parse.js'
import { CONFIG_VERSION } from './schema.js'

describe('migrateConfig', () => {
  it('passes the current version through and assumes version 1 when absent', () => {
    expect(migrateConfig({ version: CONFIG_VERSION, a: 1 })).toEqual({
      raw: { version: CONFIG_VERSION, a: 1 },
    })
    expect(migrateConfig({ a: 1 })).toEqual({
      raw: { version: CONFIG_VERSION, a: 1, api: { port: 1337 } },
      migratedFrom: 1,
    })
  })

  it.each(['llamacpp-upstream', 'llamacpp', 'mlx'])(
    'reads a current file with engines.default %s as it is',
    (value) => {
      const raw = { version: CONFIG_VERSION, engines: { default: value } }
      expect(migrateConfig(raw)).toEqual({ raw })
      expect(validateConfig(raw).config.engines.default).toBe(value)
    }
  )

  it.each([
    [
      'serve.engine becomes engines.default; the rest of serve is dropped',
      { version: 1, serve: { engine: 'mlx', model: 'x', ctxSize: 4096 }, api: { port: 1 } },
      { version: CONFIG_VERSION, engines: { default: 'mlx' }, api: { port: 1 } },
    ],
    [
      'engines.provider wins over serve.engine and is renamed',
      { version: 1, serve: { engine: 'mlx' }, engines: { provider: 'llamacpp', autoInstall: false } },
      { version: CONFIG_VERSION, engines: { default: 'llamacpp' }, api: { port: 1337 } },
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
    ['no api at all', { version: 3, tui: { model: 'm' } }, { tui: { model: 'm' }, api: { port: 1337 } }],
  ])('3 → 4: %s', (_name, from, to) => {
    expect(migrateConfig(from)).toEqual({ raw: { version: CONFIG_VERSION, ...to }, migratedFrom: 3 })
  })

  it.each([
    [
      'tui.mode is dropped, the rest of tui kept',
      { version: 4, tui: { mode: 'personal', model: 'm' } },
      { tui: { model: 'm' }, api: { port: 1337 } },
    ],
    [
      'a tui left empty goes too',
      { version: 4, tui: { mode: 'server' }, api: { port: 9 } },
      { api: { port: 9 } },
    ],
    ['a file without it is left as it was', { version: 4, api: { port: 9 } }, { api: { port: 9 } }],
  ])('4 → 5: %s', (_name, from, to) => {
    expect(migrateConfig(from)).toEqual({ raw: { version: CONFIG_VERSION, ...to }, migratedFrom: 4 })
  })

  it.each([0, 1337, 8000])('keeps port %i and upgrades the saved follow-server endpoint', (port) => {
    expect(
      migrateConfig({ version: 5, api: { port }, tui: { endpoint: 'http://127.0.0.1:1337/v1' } }).raw
    ).toMatchObject({ version: CONFIG_VERSION, api: { port }, tui: { endpoint: '' } })
  })
  it('preserves an explicit chat target even if its port is the new server default', () => {
    const endpoint = 'http://127.0.0.1:1339/v1'
    expect(migrateConfig({ version: 5, tui: { endpoint } }).raw).toMatchObject({
      api: { port: 1337 },
      tui: { endpoint },
    })
  })

  it.each([
    [
      'the six dead fields are stripped, their siblings kept',
      {
        version: 6,
        api: { cors: true, port: 1337 },
        admin: { openOnStart: true, autoStart: true },
        engines: { autoInstall: true, default: 'llamacpp-upstream' },
        managed: { mode: 'off', image: 'x' },
        update: { channel: 'stable', checkOnStart: true },
      },
      {
        api: { port: 1337 },
        admin: { autoStart: true },
        engines: { default: 'llamacpp-upstream' },
        update: { checkOnStart: true },
      },
    ],
    [
      'sections without the dead fields are left alone',
      { version: 6, tui: { model: 'm' } },
      { tui: { model: 'm' } },
    ],
  ])('6 → 7: %s', (_name, from, to) => {
    expect(migrateConfig(from)).toEqual({ raw: { version: CONFIG_VERSION, ...to }, migratedFrom: 6 })
  })

  it('refuses a newer file with an update hint', () => {
    expect(() => migrateConfig({ version: CONFIG_VERSION + 1 })).toThrow(/this atc understands/)
  })
})
