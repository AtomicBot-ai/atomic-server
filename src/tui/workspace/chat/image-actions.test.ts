import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
it('attaches a selected image and removes it without losing the draft', async () => {
  let s = { ...createWorkspace('chat'), setupComplete: true, draft: 'Describe' }
  const image = vi.fn(async () => ({ name: 'file.png', url: 'data:image/png;base64,aQ==', bytes: 1 }))
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { image } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  await activate('images', ctx)
  expect(s).toMatchObject({ overlay: 'endpoint', edit: 'image-path' })
  s.editValue = '/a/file.png'
  await activate('save-edit', ctx)
  expect(image).toHaveBeenCalledWith('/a/file.png')
  expect(s.images).toHaveLength(1)
  expect(s).toMatchObject({ draft: 'Describe', focus: 'composer', overlay: null })
  await activate('images', ctx)
  expect(s.overlay).toBe('images')
  await activate('image-remove:0', ctx)
  expect(s.images).toEqual([])
})
