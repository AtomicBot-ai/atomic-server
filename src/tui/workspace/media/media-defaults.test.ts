import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { fieldValue, inputObject, setField } from '../operations/operation-model.js'

function fixture() {
  let state = { ...createWorkspace('chat'), setupComplete: true }
  const execute = vi.fn(async (name: string): Promise<unknown> =>
    name.endsWith('capabilities')
      ? {
          defaults: { width: 768, height: 512, steps: 12, cfgScale: 1, video: { frames: 121, fps: 24 } },
          workflows: ['create'],
        }
      : []
  )
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
    copy: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
  }
  return { ctx, execute }
}

it.each(['image', 'video'])(
  'opens a fresh %s studio with the shared draft defaults before a model is loaded',
  async (task) => {
    const { ctx, execute } = fixture()
    await activate(`playground-task:${task}`, ctx)
    const request = inputObject(ctx.get().operationInput)['request']
    expect(request).toEqual({
      prompt: '',
      workflow: 'create',
      width: 512,
      height: 512,
      steps: 20,
      cfgScale: 7,
      ...(task === 'image' ? { batchSize: 1 } : {}),
    })
    expect(execute).not.toHaveBeenCalledWith(expect.stringContaining('capabilities'))
    await activate('media-reset', ctx)
    expect(inputObject(ctx.get().operationInput)['request']).toEqual(request)
    await activate('operation-run', ctx)
    expect(ctx.get().media.error).toContain('Choose a downloaded model')
    expect(execute).not.toHaveBeenCalledWith(`media.${task}.create`, expect.anything())
  }
)

it.each(['image', 'video'])(
  'replaces provisional %s values with loaded-model defaults and preserves later explicit edits',
  async (task) => {
    const { ctx } = fixture()
    await activate(`playground-task:${task}`, ctx)
    ctx.update((s) => ({
      ...s,
      operationInput: setField(s.operationInput, 'request.prompt', 'Keep my prompt'),
      workspace: {
        services: [
          {
            kind: 'image-video',
            state: 'ready',
            model: 'Media model',
            details: { model: { loaded: { modality: task } } },
          },
        ],
      } as never,
    }))
    await activate('media-refresh', ctx)
    expect(inputObject(ctx.get().operationInput)['request']).toEqual({
      prompt: 'Keep my prompt',
      workflow: 'create',
      width: 768,
      height: 512,
      steps: 12,
      cfgScale: 1,
      ...(task === 'image' ? { batchSize: 1 } : { frames: 121, fps: 24 }),
    })
    ctx.update((s) => ({ ...s, operationInput: setField(s.operationInput, 'request.width', 1024) }))
    await activate('media-refresh', ctx)
    expect(fieldValue(ctx.get().operationInput, 'request.width')).toBe(1024)
    await activate('media-reset', ctx)
    expect(fieldValue(ctx.get().operationInput, 'request.width')).toBe(768)
    expect(fieldValue(ctx.get().operationInput, 'request.prompt')).toBe('Keep my prompt')
  }
)
