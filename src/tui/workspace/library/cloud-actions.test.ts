import { expect, it, vi } from 'vitest'
import { cloudAction } from './cloud-actions.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
it('hides cloud keys in the editor and clears them after saving', async () => {
  let state = createWorkspace('welcome')
  state.cloud = {
    ...state.cloud,
    editing: true,
    provider: 'fixture',
    url: 'https://provider.example/v1',
    models: 'one, two',
    key: 'private-fixture-key',
  }
  state.overlay = 'cloud'
  const execute = vi.fn(async () => ({ providers: [] }))
  const ctx = {
    get: () => state,
    update: (f) => {
      state = f(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  } as ActionContext
  await cloudAction('cloud-key', ctx)
  const frame = workspaceFrame(state, 80, 30, 0)
    .cells.flat()
    .map((c) => c.char)
    .join('')
  expect(frame).not.toContain('private-fixture-key')
  expect(frame).toContain('••••')
  await cloudAction('save-edit', ctx)
  await cloudAction('cloud-save', ctx)
  expect(execute).toHaveBeenCalledWith('cloud.connect', {
    provider: 'fixture',
    base_url: 'https://provider.example/v1',
    api_key: 'private-fixture-key',
    models: ['one', 'two'],
  })
  expect(state.cloud.key).toBe('')
  expect(state.editValue).toBe('')
})
it('locks repeated input while checking and returns to connected cards only after success', async () => {
  let state = createWorkspace('welcome')
  state.firstRun = 'cloud'
  state.overlay = null
  state.cloud = {
    ...state.cloud,
    editing: true,
    provider: 'openai',
    url: 'https://provider.example/v1',
    models: 'one',
    key: 'fixture',
  }
  let finish!: () => void
  const execute = vi.fn(async (name: string) =>
    name === 'cloud.connect'
      ? new Promise<void>((resolve) => {
          finish = resolve
        })
      : { providers: [{ provider: 'openai', connected: true }] }
  )
  const ctx = {
    get: () => state,
    update: (f) => {
      state = f(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  } as ActionContext
  const pending = cloudAction('cloud-save', ctx)
  await Promise.resolve()
  expect(state.cloud.checking).toBe(true)
  const frame = workspaceFrame(state, 80, 30, 0)
  expect(
    frame.cells
      .flat()
      .map((c) => c.char)
      .join('')
  ).toContain('Checking')
  expect(frame.targets.some((t) => t.id === 'cloud-save')).toBe(false)
  await cloudAction('cloud-save', ctx)
  await cloudAction('cloud-close', ctx)
  expect(state.cloud.editing).toBe(true)
  expect(execute.mock.calls.filter(([name]) => name === 'cloud.connect')).toHaveLength(1)
  finish()
  await pending
  expect(state.cloud).toMatchObject({ checking: false, editing: true, key: '' })
  expect(
    workspaceFrame(state, 80, 30, 0)
      .cells.flat()
      .map((c) => c.char)
      .join('')
  ).toContain('[Connected]')
})
it('retains the editor on a failed connection and does not add a connected provider', async () => {
  let state = createWorkspace('welcome')
  state.cloud = {
    ...state.cloud,
    editing: true,
    provider: 'openai',
    url: 'https://provider.example/v1',
    models: 'one',
    key: 'fixture',
  }
  const ctx = {
    get: () => state,
    update: (f) => {
      state = f(state)
    },
    controller: {
      runtime: {
        execute: async () => {
          throw new Error('Check the key and try again.')
        },
      },
    } as unknown as WorkspaceController,
  } as ActionContext
  await cloudAction('cloud-save', ctx)
  expect(state.cloud).toMatchObject({
    checking: false,
    editing: true,
    providers: [],
    error: 'Check the key and try again.',
  })
})
it('keeps the connection action visible on a compact terminal and preserves focus on connected cards', async () => {
  const { COLORS } = await import('../draw/canvas.js')
  const state = createWorkspace('welcome')
  state.firstRun = 'cloud'
  state.overlay = 'cloud'
  state.overlay = null
  Object.assign(state.cloud, {
    editing: true,
    provider: 'openai',
    url: 'https://api.openai.com/v1',
    key: 'fixture',
  })
  const editor = workspaceFrame(state, 54, 24, 0)
  expect(editor.targets.find((t) => t.id === 'cloud-save')).toMatchObject({ height: 3 })
  expect(editor.targets.every((t) => t.x + t.width <= 54 && t.y + t.height <= 24)).toBe(true)
  state.cloud.editing = false
  state.cloud.providers = [{ provider: 'openai', connected: true }]
  state.focus = 'cloud-choice:0'
  const list = workspaceFrame(state, 54, 24, 0)
  const target = list.targets.find((t) => t.id === 'cloud-choice:0')!
  expect(list.cells[target.y]?.[target.x]?.color).toBe(COLORS.gold)
  expect(list.cells[target.y + 1]?.[target.x + 1]?.background).toBe(COLORS.header)
})
