import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import { COLORS } from '../draw/canvas.js'

it.each([
  [54, 24],
  [120, 36],
  [180, 56],
])('anchors a scrolling picker above the intact composer at %ix%i', (width, height) => {
  const s = createWorkspace('chat')
  s.overlay = 'model-picker'
  s.models = Array.from({ length: 40 }, (_, i) => `Model ${i}`)
  s.focus = 'model:0'
  s.draft = 'Keep this draft'
  for (let i = 0; i < 25; i++)
    Object.assign(
      s,
      workspaceInput('', { downArrow: true } as Key, s, workspaceFrame(s, width, height, 0)).patch
    )
  const frame = workspaceFrame(s, width, height, 0)
  expect(s.focus).toBe('model:25')
  expect(frame.targets.some((t) => t.id === s.focus)).toBe(true)
  const row = frame.targets.find((t) => t.id === s.focus)!
  expect(workspaceInput(`[<0;${row.x + 1};${row.y + 1}M`, {} as Key, s, frame).action).toBe('model:25')
  expect(frame.popover!.y + frame.popover!.height).toBeLessThanOrEqual(height - 10)
  expect(frame.cells.flat().some((c) => c.background === COLORS.composerFrame && c.char === ' ')).toBe(true)
  expect(frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain('Keep this draft')
  expect(frame.targets.some((t) => t.id === 'send' || t.id === 'new')).toBe(false)
  expect(workspaceInput('[<0;1;1M', {} as Key, s, frame).action).toBe('close')
  expect(workspaceInput('', { escape: true } as Key, s, frame).action).toBe('close')
})
