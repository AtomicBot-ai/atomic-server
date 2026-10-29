import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import { activate } from '../actions.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { workspaceInput } from '../input.js'
import type { Key } from 'ink'
import type { WorkspaceController } from '../controller.js'

it.each(['endpoint', 'document-path', 'image-path', 'setting:api.port'])(
  'shows a failed %s confirmation in the retained editor at both terminal sizes',
  (edit) => {
    const s = {
      ...createWorkspace('chat'),
      overlay: 'endpoint' as const,
      edit,
      editValue: 'bad input',
      focus: 'save-edit',
      message: 'Could not read that file or value.',
    }
    for (const [width, height] of [
      [54, 24],
      [120, 40],
    ]) {
      const frame = workspaceFrame(s, width!, height!, 0)
      expect(frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain(s.message)
      expect(frame.targets.some((t) => t.id === 'save-edit')).toBe(true)
      expect(workspaceInput('[<32;1;1M', {} as Key, s, frame).patch?.message).toBe(s.message)
    }
  }
)

it('clears a document failure after correcting the retained path and on reopening', async () => {
  let state = { ...createWorkspace('chat'), setupComplete: true }
  const document = vi
    .fn()
    .mockRejectedValueOnce(new Error('Missing document'))
    .mockResolvedValue({ id: 'doc', name: 'notes.txt' })
  const ctx = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { document } as unknown as WorkspaceController,
  } as ActionContext
  await activate('document-add', ctx)
  try {
    await activate('save-edit', ctx)
  } catch (error) {
    state = { ...state, message: (error as Error).message }
  }
  expect(state.overlay).toBe('endpoint')
  await activate('save-edit', ctx)
  expect(state.documents).toHaveLength(1)
  expect(state.message).toBe('')
  state.message = 'Previous screen status'
  await activate('document-add', ctx)
  expect(state.message).toBe('')
})
