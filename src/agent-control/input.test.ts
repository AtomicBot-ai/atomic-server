import { describe, expect, it } from 'vitest'
import { parseControlInput } from './input.js'
describe('control input', () => {
  it('preserves nested parameter and secret references without shell expansion', () => {
    expect(parseControlInput('{"request":{"prompt":"$(echo never)"}}')).toEqual({
      request: { prompt: '$(echo never)' },
    })
  })
  it.each(['[]', 'null', '12', '"input"', '{bad'])('rejects a nonobject %s', (value) => {
    expect(() => parseControlInput(value)).toThrow()
  })
})
