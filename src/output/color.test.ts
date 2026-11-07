import { describe, expect, it } from 'vitest'
import { colorEnabled, colorsFor, stripAnsi, trueColorSupported } from './color.js'

describe('color', () => {
  it.each([
    [{ isTTY: true, env: {}, noColor: false }, true],
    [{ isTTY: false, env: {}, noColor: false }, false],
    [{ isTTY: true, env: { NO_COLOR: '1' }, noColor: false }, false],
    [{ isTTY: false, env: { FORCE_COLOR: '1' }, noColor: false }, true],
    [{ isTTY: true, env: { FORCE_COLOR: '0' }, noColor: false }, true],
    [{ isTTY: true, env: { TERM: 'dumb' }, noColor: false }, false],
    [{ isTTY: true, env: {}, noColor: true }, false],
  ])('%j → %s', (facts, expected) => {
    expect(colorEnabled(facts)).toBe(expected)
  })

  it('wraps text only when enabled', () => {
    expect(colorsFor(false).red('x')).toBe('x')
    expect(stripAnsi(colorsFor(true).red('x'))).toBe('x')
    expect(colorsFor(true).bold('x')).not.toBe('x')
  })
})

it.each([
  [{ WT_SESSION: 'windows-terminal-session' }, true],
  [{ COLORTERM: 'truecolor' }, true],
  [{ COLORTERM: '24bit' }, true],
  [{ WT_SESSION: '' }, false],
  [{}, false],
])('detects truecolor from terminal capabilities %j', (env, expected) => {
  expect(trueColorSupported(env)).toBe(expected)
})
