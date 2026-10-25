import { expect, it, vi } from 'vitest'
import { settingsDraftAction } from './settings-actions.js'
import { createWorkspace } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
it('stages config edits, discards them, and writes only on Save changes', async () => {
  let state = createWorkspace('access')
  state.base.config.rows = [
    {
      path: 'api.port',
      type: 'number',
      value: '1337',
      source: 'default',
      description: '',
      values: undefined,
    },
  ]
  const execute = vi.fn(async () => ({}))
  const ctx = {
    get: () => state,
    update: (f) => {
      state = f(state)
    },
    controller: { runtime: { execute }, run: vi.fn() } as unknown as WorkspaceController,
  } as ActionContext
  await settingsDraftAction('setting:api.port', ctx)
  state.editValue = '1999'
  await settingsDraftAction('save-edit', ctx)
  expect(state.configDraft).toEqual({ 'api.port': '1999' })
  expect(execute).not.toHaveBeenCalled()
  await settingsDraftAction('settings-discard', ctx)
  expect(state.configDraft).toEqual({})
  state.configDraft = { 'api.port': '1999' }
  await settingsDraftAction('settings-save', ctx)
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'api.port': 1999 } })
  expect(state.configDraft).toEqual({})
})
