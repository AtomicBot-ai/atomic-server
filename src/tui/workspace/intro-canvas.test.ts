import { expect, it } from 'vitest'
import { introCanvas } from './intro-canvas.js'
import { COLORS, hit } from './draw/canvas.js'
import { BRAND_SHADOW } from './draw/brand-mark.js'

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [40, 16],
])('shows engine progress and an inverted CTA at %ix%i', (width, height) => {
  const c = introCanvas(width, height, 0, false, 'Press any key')
  const button = c.targets.find((target) => target.id === 'intro-continue')!
  expect(button.height).toBe(3)
  expect(c.cells[button.y]![button.x]!.background).toBe(COLORS.gold)
  expect(hit(c, button.x + 1, button.y + 2)?.id).toBe('intro-continue')
  const intro = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(intro.match(/Press any key/g)).toHaveLength(1)
  expect(intro).not.toMatch(/\[\s+Press any key/)
  const download = introCanvas(width, height, 0, false, '', {
    name: 'llamacpp-upstream',
    progress: { taskId: 'engine', transferred: 25, total: 100, percent: 25 },
  })
  const content = download.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(content).toContain('25%')
  expect(content).toContain('Downloading')
  expect(content).toContain('llama.cpp')
  expect(download.targets).toHaveLength(0)
})

it('renders the intro artwork in white and leaves space above its action', () => {
  const c = introCanvas(120, 36, 0, false, 'Press any key')
  const action = c.targets.find((target) => target.id === 'intro-continue')!
  const artwork = c.cells
    .slice(2, action.y - 1)
    .flatMap((row) => row.slice(8, 112))
    .filter((cell) => cell.char.trim())
  expect(artwork.length).toBeGreaterThan(100)
  expect(artwork.filter((cell) => cell.color === COLORS.text).length).toBeGreaterThan(100)
  expect(artwork.filter((cell) => cell.color === BRAND_SHADOW).length).toBeGreaterThan(10)
  expect(artwork.every((cell) => cell.color === COLORS.text || cell.color === BRAND_SHADOW)).toBe(true)
  expect(c.cells[action.y - 1]!.slice(20, 100).every((cell) => cell.char === ' ')).toBe(true)
})
