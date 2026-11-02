import { expect, it } from 'vitest'
import type { EngineChoice } from '../../../terminal-setup/index.js'
import { drawIntroEngines } from './intro-engines.js'

const error = 'The server did not start.\nThe admin cannot listen on 0.0.0.0.\nHint: keep 127.0.0.1'
it.each([
  [40, 16],
  [54, 24],
  [80, 24],
  [120, 36],
])('shows a failed check with its reason, hint and recovery controls at %ix%i', (width, height) => {
  const frame = drawIntroEngines(width, height, [], 0, error)
  const screen = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  for (const line of error.split('\n')) expect(screen).toContain(line)
  expect(screen).toContain('Engines could not be checked.')
  expect(screen).not.toContain('No engines loaded')
  expect(frame.targets.map((target) => target.id)).toEqual(['retry', 'back', 'skip', 'quit'])
  expect(frame.cells).toHaveLength(height)
  expect(frame.cells.every((row) => row.length === width)).toBe(true)
})

it('keeps engine cards above a wrapped install failure and leaves Retry accessible', () => {
  const choices = Array.from({ length: 5 }, (_, i) => ({
    id: `llamacpp-upstream|b${i}|cpu`,
    provider: 'llamacpp-upstream',
    version: `b${i}`,
    backend: 'cpu',
    installed: false,
  })) as EngineChoice[]
  const frame = drawIntroEngines(54, 24, choices, 4, error)
  const lines = frame.cells.map((row) => row.map((cell) => cell.char).join(''))
  const errorRow = lines.findIndex((line) => line.includes('The server did not start.'))
  for (const card of frame.targets.filter((target) => target.id.startsWith('engine:')))
    expect(card.y + card.height).toBeLessThan(errorRow)
  expect(frame.targets.some((target) => target.id === 'engine:4')).toBe(true)
  expect(lines.join('\n')).toContain('Hint: keep 127.0.0.1')
  expect(frame.targets.find((target) => target.id === 'retry')!.y).toBeGreaterThan(errorRow)
})
