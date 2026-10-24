import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../action-types.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { chatParametersAction } from './parameters.js'
import { parameterValues } from './parameter-values.js'
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('opens the right-side request settings at %sx%s and closes with Escape', async (width, height) => {
  let state = { ...createWorkspace('chat'), setupComplete: true } as WorkspaceState
  const ctx = {
    get: () => state,
    update: (fn: (v: WorkspaceState) => WorkspaceState) => {
      state = fn(state)
    },
  } as ActionContext
  const frame = workspaceFrame(state, width, height, 0),
    target = frame.targets.find((t) => t.id === 'chat-parameters')!
  expect(target.x + target.width).toBe(width - 2)
  expect(target.y).toBeLessThan(frame.targets.find((t) => t.id === 'composer')!.y)
  const clicked = workspaceInput(`[<0;${target.x + 1};${target.y + 1}M`, {} as Key, state, frame)
  expect(clicked.action).toBe('chat-parameters')
  await chatParametersAction(clicked.action!, ctx)
  const opened = workspaceFrame(state, width, height, 0)
  expect(opened.popover!.x + opened.popover!.width).toBe(width - 1)
  expect(opened.targets.some((t) => t.id === 'feature-field:system')).toBe(true)
  expect(workspaceInput('', { escape: true } as Key, state, opened).action).toBe('close')
  await chatParametersAction('close', ctx)
  expect(state.overlay).toBeNull()
  expect(state.focus).toBe('chat-parameters')
})
it('saves valid request parameters without dropping feature choices or sending inference', async () => {
  let state = {
    ...createWorkspace('chat'),
    chatPreferences: { atomic_skills: ['review'], temperature: 0.2 },
  } as WorkspaceState
  const send = vi.fn(),
    ctx = {
      get: () => state,
      update: (fn: (v: WorkspaceState) => WorkspaceState) => {
        state = fn(state)
      },
      send,
    } as unknown as ActionContext
  await chatParametersAction('chat-parameters', ctx)
  state.featureEditor!.value['temperature'] = '0.8'
  state.featureEditor!.value['system'] = 'Be concise.'
  await chatParametersAction('feature-save', ctx)
  expect(state.chatPreferences).toMatchObject({
    temperature: 0.8,
    atomic_system: 'Be concise.',
    atomic_skills: ['review'],
  })
  expect(send).not.toHaveBeenCalled()
  expect(() => parameterValues({ parameters: '[]' })).toThrow('JSON object')
  expect(() => parameterValues({ parameters: '{"model":"wrong"}' })).toThrow('managed')
  expect(() => parameterValues({ temperature: '-1' })).toThrow('temperature')
  expect(() => parameterValues({ max_tokens: '1.5' })).toThrow('tokens')
})
