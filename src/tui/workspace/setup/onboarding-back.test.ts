import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { hit } from '../draw/canvas.js'

it.each([
  [54, 24],
  [80, 24],
  [100, 30],
  [120, 40],
])('keeps a clickable Back and a model recovery action at %i×%i', (width, height) => {
  const state = {
    ...createWorkspace('welcome'),
    firstRun: 'connect' as const,
    message: 'Model failed to load',
  }
  const frame = workspaceFrame(state, width!, height!, 0)
  const back = frame.targets.filter((t) => t.id === 'first-back')
  expect(back).toHaveLength(1)
  expect(back[0]!.y).toBeLessThan(height! - 1)
  expect(hit(frame, back[0]!.x, back[0]!.y)?.id).toBe('first-back')
  const recovery = frame.targets.find((t) => t.id === 'first-model')!
  expect(recovery).toBeDefined()
  for (let y = recovery.y; y < recovery.y + recovery.height; y++)
    for (let x = recovery.x; x < recovery.x + recovery.width; x++)
      expect(hit(frame, x, y)?.id).toBe('first-model')
})
