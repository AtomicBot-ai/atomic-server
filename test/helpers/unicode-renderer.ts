/** Exercise the renderer path seen in SERVER-N with synthetic text, including UTF-16 edge cases. */
import { Box, renderToString, Text } from 'ink'
import { createElement } from 'react'

const SAMPLES = [
  'Plain ASCII',
  'Привет мир',
  '你好世界',
  '😀👩‍💻🏳️‍🌈',
  'بِسْمِ',
  '؀١٢٣',
  '각',
  'x\u0301'.repeat(24),
  '\u200e\u200f\u2066\u2069',
  '\uD800',
  '\uDC00',
  'a\uD800b\uDC00',
  '─┌┐└┘━',
]

export function unicodeRendererProbe() {
  let frames = 0
  let characters = 0
  for (let round = 0; round < 12; round += 1) {
    for (const sample of SAMPLES) {
      const label = `probe-${frames}`
      const output = renderToString(
        createElement(
          Box,
          { flexDirection: 'column', width: 30 },
          createElement(Text, null, label),
          createElement(Text, null, sample.repeat(3))
        ),
        { columns: 30 }
      )
      if (!output.includes(label)) throw new Error('Unicode renderer lost its frame label.')
      characters += output.length
      frames += 1
    }
  }
  return { frames, characters }
}
