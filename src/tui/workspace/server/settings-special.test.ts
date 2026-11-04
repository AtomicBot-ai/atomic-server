import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { SHORTCUTS } from './settings-special.js'
import { workspaceInput } from '../input.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'

it('names the Ctrl+K destination consistently with its handler and footer', () => {
  const s = createWorkspace('chat'),
    frame = workspaceFrame(s, 100, 30, 0)
  expect(workspaceInput('k', { ctrl: true } as Key, s, frame).action).toBe('help')
  expect(SHORTCUTS.find(([key]) => key === 'Ctrl+K')?.[1]).toBe('Help')
  expect(frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).toContain('Ctrl+K Help')
})
