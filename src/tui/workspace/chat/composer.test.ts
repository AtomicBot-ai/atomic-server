import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import { eyeSize } from '../draw/art.js'

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [180, 56],
  [240, 70],
])('keeps composer controls inside the frame and independently clickable at %ix%i', (width, height) => {
  const s = createWorkspace('chat'),
    frame = workspaceFrame(s, width, height, 0)
  const controls = ['composer', 'send', 'choose-engine', 'choose-model'].map((id) =>
    frame.targets.find((t) => t.id === id)!
  )
  const bottom = height - 4
  for (const t of controls) {
    expect(t.y).toBeGreaterThan(bottom - 5)
    expect(t.y + t.height).toBeLessThanOrEqual(bottom - 1)
    expect(workspaceInput(`[<0;${t.x + 1};${t.y + 1}M`, {} as Key, s, frame).action).toBe(t.id)
    if (t.id !== 'composer') {
      s.focus = t.id
      expect(workspaceInput('', { return: true } as Key, s, frame).action).toBe(t.id)
    }
    for (const other of controls.filter((other) => other !== t)) {
      expect(
        t.x >= other.x + other.width ||
          t.x + t.width <= other.x ||
          t.y >= other.y + other.height ||
          t.y + t.height <= other.y
      ).toBe(true)
    }
  }
})

it('fits a stable visual eye proportion inside two thirds of roomy bounds', () => {
  for (const [width, height] of [
    [100, 20],
    [180, 45],
    [240, 65],
    [500, 100],
  ]) {
    const size = eyeSize(width!, height!)
    expect(size.width).toBeLessThanOrEqual(Math.floor((width! * 2) / 3))
    expect(size.height).toBeLessThanOrEqual(Math.floor((height! * 2) / 3))
    expect(Math.abs((size.width * 0.96) / (size.height * 2) - 4 / 3)).toBeLessThan(0.04)
  }
  expect(eyeSize(46, 5).height).toBe(5)
})
