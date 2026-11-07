import { expect, it, vi } from 'vitest'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { loadSetupMedia, mediaSetupAction } from './media-step.js'
import { libraryAction } from '../library/library-actions.js'

it.each([
  ['text', null],
  ['text', 'image'],
  ['audio', 'video'],
] as const)('keeps catalog category %s after onboarding media %s', async (category, download) => {
  let state: WorkspaceState = {
    ...createWorkspace('welcome'),
    firstRun: 'media',
    libraryCategory: category,
    libraryEngines: ['llamacpp-upstream'],
  }
  const write = vi.fn(async () => {})
  const execute = vi.fn(async (name: string, input: Record<string, unknown>) => {
    if (name === 'models.catalog')
      return { rows: [{ id: input.category, name: input.category, category: input.category }] }
    if (name === 'artifacts.plan') return { digest: 'media', blockers: [] }
    return {}
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      runtime: { execute, snapshot: async () => null },
      catalogPreferences: { write },
    } as unknown as WorkspaceController,
  }
  await loadSetupMedia(ctx)
  expect(state.libraryCategory).toBe(category)
  if (download) {
    await mediaSetupAction(`media-queue:${download === 'image' ? 0 : 1}`, ctx)
    expect(execute).toHaveBeenCalledWith('artifacts.plan', { category: download, model_id: download })
    expect(execute).toHaveBeenCalledWith(
      'artifacts.install',
      expect.objectContaining({ plan_digest: 'media' })
    )
    expect(state.libraryCategory).toBe(category)
  }
  await libraryAction('library:catalog', ctx)
  expect(execute).toHaveBeenLastCalledWith('models.catalog', { category, query: '', refresh: false })
  expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ libraryCategory: category }))
})
