import { expect, it } from 'vitest'
import { connectionIllustration } from './connection-illustrations.js'
import { drawConnectionChoices } from './connection-art.js'
import { canvas } from '../draw/canvas.js'

it.each(['agent', 'endpoint'] as const)(
  'keeps every %s pose within its full and compact footprint',
  (kind) => {
    for (const compact of [true, false])
      for (const seconds of [0, 0.8, 1.6, 3.8, 4.9, 5.5, 10.3]) {
        const rows = connectionIllustration(kind, seconds, compact)
        expect(rows).toHaveLength(compact ? 3 : 5)
        for (const row of rows) {
          expect(row).toHaveLength(compact ? 9 : 17)
          expect(row).toMatch(/^[ -~]+$/)
        }
      }
  }
)

it('blinks the Rover without moving its square body or changing either card title', () => {
  const normal = connectionIllustration('agent', 0, false)
  const blink = connectionIllustration('agent', 5, false)
  expect(normal[1]).toContain('o o')
  expect(blink[1]).toContain('- -')
  expect(blink.filter((_, i) => i !== 1)).toEqual(normal.filter((_, i) => i !== 1))
  for (const width of [54, 80]) {
    const frame = canvas(width, 24)
    drawConnectionChoices(frame, 1, 2, width - 2, 22, '', 0, true)
    const body = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(body).toContain('Configure an endpoint')
    expect(body).toContain('Connect an agent')
    for (const target of frame.targets) {
      expect(target.x + target.width).toBeLessThanOrEqual(width)
      expect(target.y + target.height).toBeLessThanOrEqual(23)
    }
    expect(body).toContain(width === 80 ? '+-----+' : '.---.')
  }
})
