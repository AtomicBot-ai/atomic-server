import { describe, expect, it } from 'vitest'
import { checkValue, coerceValue, envOverrides, parseConfigDocument, validateConfig } from './parse.js'
import { fieldFor } from './schema.js'

describe('coerceValue', () => {
  it.each([
    ['api.port', '1337', 1337],
    ['api.cors', 'off', false],
    ['api.trustedHosts', 'a, b', ['a', 'b']],
    ['api.trustedHosts', '', []],
    ['log.level', 'debug', 'debug'],
    ['api.host', ' x ', 'x'],
  ])('%s ← %j', (path, raw, expected) => {
    expect(coerceValue(fieldFor(path)!, raw)).toEqual(expected)
  })

  it('rejects what a field cannot hold', () => {
    expect(() => coerceValue(fieldFor('api.port')!, 'many')).toThrow(/not a number/)
    expect(() => coerceValue(fieldFor('api.cors')!, 'maybe')).toThrow(/true or false/)
    expect(() => coerceValue(fieldFor('log.level')!, 'loud')).toThrow(/one of/)
  })
})

describe('validateConfig', () => {
  it('fills defaults, keeps unknown keys and reports ranges', () => {
    const parsed = validateConfig({ version: 1, api: { port: 8080, extra: 1 }, custom: true })
    expect(parsed.config.api.port).toBe(8080)
    expect(parsed.config.api.host).toBe('127.0.0.1')
    expect(parsed.extra).toEqual({ custom: true, api: { extra: 1 } })
    expect(parsed.warnings).toHaveLength(2)
    expect(() => validateConfig({ api: { port: 70000 } })).toThrow(
      expect.objectContaining({ details: expect.stringMatching(/≤ 65535/) })
    )
    expect(checkValue(fieldFor('models.autoLoad')!, [1])).toMatch(/list of strings/)
  })

  it('parses documents strictly', () => {
    expect(() => parseConfigDocument('nope')).toThrow(/valid JSON/)
    expect(() => parseConfigDocument('[]')).toThrow(/JSON object/)
    expect(parseConfigDocument('{"a":1}')).toEqual({ a: 1 })
  })
})

describe('envOverrides', () => {
  it('reads only known variables, typed', () => {
    const over = envOverrides({ ATC_API_PORT: '9', ATC_LOG_LEVEL: 'warn', ATC_UNKNOWN: 'x', PATH: '/' })
    expect(over.map((o) => [o.field.path, o.value])).toEqual([
      ['api.port', 9],
      ['log.level', 'warn'],
    ])
  })
})

it.each(['/qa v1', '/qa?x', '/qa#x', '/qa%20v1', '/qa//v1', '/qa/../v1', 'v1', '/тест'])(
  'refuses an API prefix that cannot be matched verbatim as a route: %s',
  (prefix) => {
    expect(checkValue(fieldFor('api.prefix')!, prefix)).toMatch(/prefix/)
  }
)
