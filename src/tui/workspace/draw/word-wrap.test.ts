import { expect, it } from 'vitest'
import { textWidth, wrapWords } from './canvas.js'

it('keeps error recovery words intact within terminal width', () => {
  const message = 'No inference engine is installed. Install llama.cpp in Models Hub, then retry.'
  const lines = wrapWords(message, 42)
  expect(lines.join(' ')).toBe(message)
  expect(lines.every((line) => textWidth(line) <= 42)).toBe(true)
  expect(lines).toEqual(['No inference engine is installed. Install', 'llama.cpp in Models Hub, then retry.'])
})

it('preserves paragraphs, removes terminal control sequences, and splits an oversized identifier', () => {
  expect(wrapWords('First\n\nRetry now', 20)).toEqual(['First', '', 'Retry now'])
  expect(wrapWords('\u001b[31mFailure\u001b[0m', 8)).toEqual(['Failure'])
  expect(wrapWords('abcdefghijk', 4)).toEqual(['abcd', 'efgh', 'ijk'])
  expect(wrapWords('恢复 engine', 7)).toEqual(['恢复', 'engine'])
  expect(wrapWords('Error', 0)).toEqual([])
})
