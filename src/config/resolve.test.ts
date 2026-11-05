import { describe, expect, it } from 'vitest'
import { resolveConfig } from './resolve.js'

describe('resolveConfig', () => {
  it('layers flags over env over file over defaults and records the source', () => {
    const resolved = resolveConfig({
      fileText: JSON.stringify({ version: 1, api: { port: 2000, host: '0.0.0.0' }, admin: { port: 3000 } }),
      env: { ATC_API_PORT: '2001' },
      flags: { 'api.port': 2002 },
    })
    expect(resolved.values.api.port).toBe(2002)
    expect(resolved.sources['api.port']).toBe('flag')
    expect(resolved.values.api.host).toBe('0.0.0.0')
    expect(resolved.sources['api.host']).toBe('file')
    expect(resolved.values.admin.port).toBe(3000)
    expect(resolved.values.api.prefix).toBe('/v1')
    expect(resolved.sources['api.prefix']).toBe('default')
    expect(resolved.file?.config.api.port).toBe(2000)
  })

  it('works without a file and surfaces invalid files', () => {
    expect(resolveConfig({ env: {} }).values.api.port).toBe(1339)
    expect(() => resolveConfig({ fileText: '{"api":{"port":"x"}}', env: {} })).toThrow(/invalid values/)
  })
})
