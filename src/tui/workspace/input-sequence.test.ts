import type { Key } from 'ink'
import { describe, expect, it } from 'vitest'
import { workspaceFrame } from './frame.js'
import { inputKeys, workspaceInputs } from './input-sequence.js'
import { createWorkspace } from './state.js'

const key = (value: Partial<Key> = {}) => value as Key

describe('keys that reach the terminal UI as one event', () => {
  // Ink holds a lone Esc for 20 ms; when the next key arrives first it parses both as one event and
  // strips the Esc, leaving a control byte with no Ctrl flag (a busy runner, a slow SSH link).
  it.each([
    ['\u0011', 'q'],
    ['\u000b', 'k'],
    ['\u0001', 'a'],
  ])('reads %j without Ctrl as Esc, then Ctrl+%s', (input, letter) => {
    expect(inputKeys(input, key())).toEqual([
      { input: '', key: { escape: true } },
      { input: letter, key: { ctrl: true } },
    ])
  })

  it.each([
    ['q', key({ ctrl: true })],
    ['a', key()],
    ['', key({ tab: true })],
    ['', key({ return: true })],
    ['hello', key()],
  ])('passes %j through as one key', (input, k) => {
    expect(inputKeys(input, k)).toEqual([{ input, key: k }])
  })

  it('closes the open overlay and still quits when Esc and Ctrl+Q arrive together', () => {
    const s = { ...createWorkspace('server'), overlay: 'help' as const }
    const results = workspaceInputs('\u0011', key(), s, workspaceFrame(s, 100, 30, 0))
    expect(results.at(0)?.action ?? results.at(0)?.patch).toBeTruthy()
    expect(results.at(-1)).toEqual({ quit: true })
  })
})
