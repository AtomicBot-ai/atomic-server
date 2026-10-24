import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'

it.each([
  ['ENOENT: no such file or directory', 'Model file not found.'],
  ['EACCES: permission denied', 'The server cannot read this file.'],
  ['Invalid GGUF header.', 'Invalid GGUF header.'],
])('keeps a failed import editable and explains %s', async (failure, message) => {
  let state = createWorkspace('models'),
    fail = true
  const execute = vi.fn(async () => {
    if (fail) throw new Error(failure)
    return { model_id: 'imported' }
  })
  const ctx = {
    get: () => state,
    update: (fn: (s: typeof state) => typeof state) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute },
      installed: async () => [{ id: 'imported', name: 'Imported', provider: 'llamacpp-upstream' }],
    },
  } as unknown as ActionContext
  await activate('catalog-import', ctx)
  state.editValue = '/models/test.gguf'
  await activate('save-edit', ctx)
  expect(state).toMatchObject({
    overlay: 'endpoint',
    edit: 'library-import',
    editValue: '/models/test.gguf',
    busy: false,
  })
  for (const [width, height] of [
    [54, 24],
    [120, 36],
  ]) {
    const frame = workspaceFrame(state, width!, height!, 0)
    const text = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(text).toContain(message)
    expect(frame.targets.some((target) => target.id === 'save-edit')).toBe(true)
  }
  fail = false
  await activate('save-edit', ctx)
  expect(state).toMatchObject({ overlay: null, message: 'Model imported.', busy: false })
  expect(execute).toHaveBeenLastCalledWith('models.import', { path: '/models/test.gguf' })
  expect(state.installed[0]?.id).toBe('imported')
})
