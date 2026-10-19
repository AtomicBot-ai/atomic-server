import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../config/index.js'
import { configRows, describeEdit, formatConfigValue } from './model.js'
import { computeRowWindow } from './row-window.js'

describe('config rows', () => {
  it('lists every field with its effective value and source', () => {
    const rows = configRows(
      resolveConfig({ fileText: '{"api":{"port":2000}}', env: { ATC_API_HOST: '0.0.0.0' } })
    )
    expect(rows.find((r) => r.path === 'api.port')).toMatchObject({ value: '2000', source: 'file' })
    expect(rows.find((r) => r.path === 'api.host')).toMatchObject({ value: '0.0.0.0', source: 'env' })
    expect(rows.find((r) => r.path === 'api.trustedHosts')).toMatchObject({ value: '', source: 'default' })
  })

  it.each([
    [undefined, ''],
    [['a', 'b'], 'a,b'],
    [{ a: 1 }, '{"a":1}'],
    [1337, '1337'],
  ])('formats %j as %j', (value, text) => expect(formatConfigValue(value)).toBe(text))
})

describe('helpers', () => {
  it('describes a saved edit', () => {
    expect(describeEdit('api.port', 1338)).toBe('api.port = 1338')
    expect(describeEdit('managed.image', undefined)).toBe('managed.image = null')
  })

  it.each([
    [0, 0, 5, { start: 0, count: 0, hiddenBefore: 0, hiddenAfter: 0 }],
    [3, 2, 5, { start: 0, count: 3, hiddenBefore: 0, hiddenAfter: 0 }],
    [10, 2, 5, { start: 0, count: 5, hiddenBefore: 0, hiddenAfter: 5 }],
    [10, 7, 5, { start: 3, count: 5, hiddenBefore: 3, hiddenAfter: 2 }],
    [10, 99, 5, { start: 5, count: 5, hiddenBefore: 5, hiddenAfter: 0 }],
  ])('computeRowWindow(%i rows, cursor %i, %i high)', (total, cursor, max, expected) =>
    expect(computeRowWindow(total, cursor, max)).toEqual(expected)
  )
})
