import { describe, expect, it } from 'vitest'
import { LOCAL_PROVIDER_IDS } from '@atomic-chat/core/settings'
import { coerceValue } from './parse.js'
import { defaultConfig, envNameFor, fieldFor, FIELDS, getAt, setAt } from './schema.js'

describe('schema', () => {
  it('derives env names from paths', () => {
    expect(envNameFor(fieldFor('api.port')!)).toBe('ATC_API_PORT')
    expect(envNameFor(fieldFor('engines.autoInstall')!)).toBe('ATC_ENGINES_AUTO_INSTALL')
    expect(envNameFor(fieldFor('proxy.ignoreSsl')!)).toBe('ATC_PROXY_IGNORE_SSL')
  })

  it('has unique paths and a default of the right type', () => {
    const paths = FIELDS.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    const config = defaultConfig()
    expect(config.api.port).toBe(1337)
    expect(config.admin.port).toBe(1338)
    expect(config.engines.default).toBe('llamacpp-upstream')
    expect(config.proxy.url).toBeUndefined()
  })

  it('offers every local provider of the core as engines.default and names them when refusing one', () => {
    const field = fieldFor('engines.default')!
    expect(field.values).toEqual(LOCAL_PROVIDER_IDS)
    for (const provider of ['tensorrt-llm', 'vllm', 'sglang', 'foundry-local'])
      expect(coerceValue(field, provider)).toBe(provider)
    expect(() => coerceValue(field, 'trt')).toThrow(/one of llamacpp-upstream, .*vllm, sglang, foundry-local/)
  })

  it('gets and sets dotted paths', () => {
    const o: Record<string, unknown> = {}
    setAt(o, 'a.b.c', 1)
    expect(getAt(o, 'a.b.c')).toBe(1)
    setAt(o, 'a.b.c', undefined)
    expect(getAt(o, 'a.b')).toEqual({})
    expect(getAt(o, 'x.y')).toBeUndefined()
  })
})
