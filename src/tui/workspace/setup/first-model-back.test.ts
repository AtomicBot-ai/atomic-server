import { expect, it, vi } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { firstRunAction } from './first-run.js'
import { firstModelChoices, selectedFirstModel } from './first-model.js'

function fixture() {
  const installed = ['first', 'second', 'mlx-model'].map((id, i) => ({
    id,
    name: id,
    provider: i === 2 ? 'mlx' : 'llamacpp-upstream',
  }))
  const repositories = [{ id: 'fixture/catalog', title: 'Catalog model', downloads: 1 }]
  let state = {
    ...createWorkspace('setup'),
    firstRun: 'model' as const,
    installed,
    engine: 'llamacpp-upstream|b1|cpu',
    setup: { ...newSetup('server'), stage: 'models' as const, repositories },
  }
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state) as typeof state
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: {
      installed: async () => state.installed,
      initializeKeys: async () => {},
      hub: async () => repositories,
      save: vi.fn(async () => {}),
      setup: {
        readPath: async () => null,
        catalogs: async () => [],
        engines: async () => [],
        installed: async () => [],
      },
      runtime: { execute: async () => ({}) },
    } as unknown as WorkspaceController,
  }
  const back = async () => {
    const result = workspaceInput(
      '',
      { escape: true } as never,
      ctx.get(),
      workspaceFrame(ctx.get(), 80, 24, 0)
    )
    expect(result.action).toBe('first-back')
    await firstRunAction(result.action!, ctx)
  }
  return { ctx, back }
}

it.each([1, 2])('keeps installed choice %i through Permissions → Back → Continue', async (index) => {
  const { ctx, back } = fixture()
  await firstRunAction(`first-model-choice:${index}`, ctx)
  const choice = selectedFirstModel(ctx.get())!
  await firstRunAction('first-model-continue', ctx)
  expect(ctx.get().setup).toBeNull()
  await back()
  expect(selectedFirstModel(ctx.get())?.key).toBe(choice.key)
  expect(ctx.get().focus).toBe(`first-model-choice:${index}`)
  await firstRunAction('first-model-continue', ctx)
  expect(ctx.controller.save).toHaveBeenLastCalledWith('tui.model', choice.key.slice(6))
})

it('maps a catalog choice to its installed row after its download finishes while on another step', async () => {
  const { ctx, back } = fixture()
  await firstRunAction('first-model-choice:3', ctx)
  ctx.update((s) => ({
    ...s,
    firstRun: 'permissions',
    page: 'welcome',
    setup: null,
    installed: [
      ...s.installed,
      { id: 'fixture/catalog/Q4.gguf', name: 'Downloaded model', provider: 'llamacpp-upstream' },
    ],
  }))
  await back()
  expect(selectedFirstModel(ctx.get())).toMatchObject({
    key: 'local:fixture/catalog/Q4.gguf',
    installed: true,
  })
  expect(firstModelChoices(ctx.get()).filter((row) => row.name === 'Catalog model')).toEqual([])
  await firstRunAction('first-model-continue', ctx)
  expect(ctx.controller.save).toHaveBeenLastCalledWith('tui.model', 'fixture/catalog/Q4.gguf')
})
