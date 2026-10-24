import { expect, it } from 'vitest'
import { introArt, introInput } from './intro-art.js'

it.each([
  [80, 24],
  [120, 36],
  [54, 24],
  [40, 16],
])('fits a %ix%i terminal using only printable ASCII', (w, h) => {
  const lines = introArt(w, h, 1)
  expect(lines).toHaveLength(h)
  for (const line of lines) {
    expect(line).toHaveLength(w)
    expect(line).toMatch(/^[ -~]*$/)
  }
  expect(lines.join('\n')).toContain('Press any key')
  expect(lines.join('\n')).not.toContain('[ ATOMIC CHAT ]')
})
it('animates the mark and prompt, but holds still with motion disabled', () => {
  expect(introArt(80, 24, 0)).not.toEqual(introArt(80, 24, 1))
  expect(introArt(80, 24, 0, false)).toEqual(introArt(80, 24, 9, false))
})
it('accepts keys and clicks, ignores mouse motion and wheel reports, and preserves quit', () => {
  expect(introInput('a', {})).toBe('continue')
  expect(introInput('[', {})).toBe('continue')
  expect(introInput('', { return: true })).toBe('continue')
  expect(introInput('\u001b[<0;20;10M', {})).toBe('continue')
  for (const report of [
    '\u001b[<32;20;10M',
    '\u001b[<64;20;10M',
    '\u001b[<0;20;10m',
    '\u001b[?1;2c',
    '[?1;2c',
    '\u001b[24;80R',
    '[24;80R',
    '\u001b[I',
    '\u001b[O',
    '\u001b]11;rgb:0000/0000/0000\u0007',
    'pasted text',
  ])
    expect(introInput(report, {})).toBe('ignore')
  expect(introInput('q', { ctrl: true })).toBe('quit')
  expect(introInput('c', { ctrl: true })).toBe('quit')
  expect(introInput('', { shift: true })).toBe('ignore')
  expect(introInput('', { return: true, eventType: 'repeat' })).toBe('ignore')
  expect(introInput('', { return: true, eventType: 'release' })).toBe('ignore')
})
