import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { fieldValue, setField } from '../operations/operation-model.js'
import { loadedMediaModel, mediaFields } from './media-model.js'

function fixture() {
  let state = { ...createWorkspace('chat'), setupComplete: true }
  state.workspace = {
    api: { running: true },
    services: [
      {
        kind: 'image-video',
        model: 'Flux',
        state: 'ready',
        details: { model: { loaded: { modality: 'image' } } },
      },
    ],
  } as never
  const execute = vi.fn(async (name: string): Promise<unknown> => {
    if (name.endsWith('capabilities'))
      return {
        defaults: { width: 512, height: 512, steps: 20, cfgScale: 7 },
        workflows: ['create', 'edit'],
        supportsGuidance: false,
        supportsNegativePrompt: true,
      }
    if (name === 'artifacts.list')
      return [
        { id: 'img', stage: 'ready', plan: { category: 'image', name: 'Flux' } },
        { id: 'vid', stage: 'ready', category: 'video' },
      ]
    if (name.endsWith('.create')) return { jobId: 'job-1' }
    if (name.endsWith('.job'))
      return {
        id: 'job-1',
        state: 'generating',
        progress: { fraction: 0.42, step: 8, totalSteps: 20, etaSeconds: 28 },
      }
    return []
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute, snapshot: async () => state.workspace },
      run: vi.fn(),
      image: async () => ({ name: 'source.png', url: 'data:image/png;base64,aQ==', bytes: 1 }),
    } as unknown as WorkspaceController,
    copy: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
  }
  return { ctx, execute }
}
it('requires the loaded model modality to match the current studio', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:video', ctx)
  expect(loadedMediaModel(ctx.get())).toBeUndefined()
  ctx.update((s) => ({ ...s, operationInput: setField(s.operationInput, 'request.prompt', 'A bird') }))
  await activate('operation-run', ctx)
  expect(ctx.get().media.error).toContain('Choose a downloaded model')
  expect(execute).not.toHaveBeenCalledWith('media.video.create', expect.anything())
})

it('opens a dedicated capability-backed form and submits a job without a generic result screen', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  expect(fieldValue(ctx.get().operationInput, 'request.width')).toBe(512)
  expect(mediaFields(ctx.get()).map((field) => field.path)).not.toContain('request.guidance')
  await activate('operation-field:request.prompt', ctx)
  ctx.update((s) => ({ ...s, editValue: 'A blue bird' }))
  await activate('save-edit', ctx)
  await activate('operation-run', ctx)
  expect(execute).toHaveBeenCalledWith('media.image.create', {
    request: expect.objectContaining({ prompt: 'A blue bird', workflow: 'create', width: 512 }),
  })
  expect(ctx.get()).toMatchObject({
    page: 'tools',
    operation: 'media.image.create',
    media: { task: 'image', job: { id: 'job-1', state: 'generating' } },
  })
  const frame = workspaceFrame(ctx.get(), 160, 48, 0)
  expect(frame.targets.some((target) => target.id === 'media-stop')).toBe(true)
  expect(
    frame.targets.some((target) => target.id === 'operation-output' || target.id === 'operation-select')
  ).toBe(false)
  expect(
    frame.cells
      .flat()
      .map((cell) => cell.char)
      .join('')
  ).toContain('8/20 steps · 28s remaining')
})

it('confirms Stop, preserves the prompt, and does not cancel when the dialog closes', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  ctx.update((s) => ({
    ...s,
    operationInput: setField(s.operationInput, 'request.prompt', 'Keep this'),
    media: { ...s.media, task: 'image', job: { id: 'job-1', state: 'generating' } },
  }))
  await activate('media-stop', ctx)
  await activate('close', ctx)
  expect(execute).not.toHaveBeenCalledWith('media.image.cancel', expect.anything())
  await activate('media-stop', ctx)
  await activate('media-stop-confirm', ctx)
  expect(execute).toHaveBeenCalledWith('media.image.cancel', { id: 'job-1' })
  expect(fieldValue(ctx.get().operationInput, 'request.prompt')).toBe('Keep this')
})

it('filters downloaded models by modality and keeps a failed load inside its picker', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  await activate('media-models', ctx)
  expect(ctx.get().media.models.map((model) => model['id'])).toEqual(['img'])
  execute.mockRejectedValueOnce(new Error('Not enough memory'))
  await activate('media-model:0', ctx)
  expect(ctx.get()).toMatchObject({
    overlay: 'media-models',
    media: { loading: false, error: 'Not enough memory' },
  })
})

it('uses a local image path for edit mode and exports the selected result only on Save', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  await activate('operation-field:request.initImage', ctx)
  ctx.update((s) => ({ ...s, editValue: '/tmp/source.png' }))
  await activate('save-edit', ctx)
  expect(fieldValue(ctx.get().operationInput, 'request.initImage')).toEqual({ base64: 'aQ==' })
  ctx.update((s) => ({
    ...s,
    media: { ...s.media, gallery: [{ id: 'result', recipe: { prompt: 'Saved bird' } }] },
  }))
  await activate('media-save', ctx)
  expect(execute).not.toHaveBeenCalledWith('media.image.export', expect.anything())
  ctx.update((s) => ({ ...s, editValue: '/tmp/result.png' }))
  await activate('save-edit', ctx)
  expect(execute).toHaveBeenCalledWith('media.image.export', { id: 'result', targetPath: '/tmp/result.png' })
  await activate('media-restore', ctx)
  expect(fieldValue(ctx.get().operationInput, 'request.prompt')).toBe('Saved bird')
})

it('keeps export failures visible in the file dialog and clears the form behind the expanded preview', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  ctx.update((s) => ({
    ...s,
    media: { ...s.media, gallery: [{ id: 'result', recipe: { prompt: 'A bird' } }] },
  }))
  await activate('media-preview', ctx)
  const preview = workspaceFrame(ctx.get(), 120, 36, 0)
  expect(preview.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).not.toContain(
    'Negative prompt'
  )
  expect(preview.targets.some((target) => target.id.startsWith('operation-field:'))).toBe(false)
  await activate('media-save', ctx)
  ctx.update((s) => ({ ...s, editValue: '/restricted/result.png' }))
  execute.mockRejectedValueOnce(new Error('Permission denied'))
  await activate('save-edit', ctx)
  expect(ctx.get().overlay).toBe('endpoint')
  const dialog = workspaceFrame(ctx.get(), 120, 36, 0)
  expect(dialog.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).toContain(
    'Permission denied'
  )
})

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [160, 48],
])('keeps fields and media dialogs reachable at %sx%s', async (width, height) => {
  const { ctx } = fixture()
  await activate('playground-task:video', ctx)
  for (const field of mediaFields(ctx.get())) {
    ctx.update((s) => ({ ...s, focus: `operation-field:${field.path}` }))
    const frame = workspaceFrame(ctx.get(), width, height, 0)
    const target = frame.targets.find((entry) => entry.id === ctx.get().focus)
    expect(target, field.path).toBeDefined()
    expect(workspaceInput(`[<0;${target!.x + 1};${target!.y + 1}M`, {} as Key, ctx.get(), frame).action).toBe(
      ctx.get().focus
    )
  }
  for (const overlay of [null, 'media-models', 'media-stop', 'media-preview'] as const) {
    ctx.update((s) => ({ ...s, overlay }))
    for (const target of workspaceFrame(ctx.get(), width, height, 0).targets) {
      expect(target.x + target.width, target.id).toBeLessThanOrEqual(width)
      expect(target.y + target.height, target.id).toBeLessThanOrEqual(
        target.y === height - 1 ? height : height - 3
      )
    }
  }
})

it('resets gallery selection when changing modality so the first video remains viewable and saveable', async () => {
  const { ctx, execute } = fixture()
  const original = execute.getMockImplementation()!
  execute.mockImplementation(async (name) =>
    name.endsWith('.gallery')
      ? name.includes('.video.')
        ? [{ id: 'video-one' }]
        : [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
      : original(name)
  )
  await activate('playground-task:image', ctx)
  await activate('media-select:2', ctx)
  await activate('playground-task:video', ctx)
  expect(ctx.get().media.selected).toBe(0)
  const frame = workspaceFrame(ctx.get(), 160, 48, 0)
  expect(frame.targets.some((target) => target.id === 'media-save')).toBe(true)
  await activate('media-save', ctx)
  ctx.update((s) => ({ ...s, editValue: '/tmp/video.mp4' }))
  await activate('save-edit', ctx)
  expect(execute).toHaveBeenCalledWith('media.video.export', {
    id: 'video-one',
    targetPath: '/tmp/video.mp4',
  })
})

it('clamps gallery selection after a refresh removes the selected result', async () => {
  const { ctx, execute } = fixture()
  await activate('playground-task:image', ctx)
  ctx.update((s) => ({
    ...s,
    media: { ...s.media, selected: 2, gallery: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] },
  }))
  execute.mockResolvedValueOnce([{ id: 'one' }])
  await activate('media-refresh', ctx)
  expect(ctx.get().media.selected).toBe(0)
  expect(workspaceFrame(ctx.get(), 160, 48, 0).targets.some((target) => target.id === 'media-save')).toBe(
    true
  )
  execute.mockResolvedValueOnce([])
  await activate('media-refresh', ctx)
  expect(ctx.get().media.selected).toBe(0)
  expect(workspaceFrame(ctx.get(), 160, 48, 0).targets.some((target) => target.id === 'media-save')).toBe(
    false
  )
})
it('shows prompt guidance instead of another Choose a model action when the loaded model is compatible', async () => {
  const { ctx } = fixture()
  await activate('playground-task:image', ctx)
  const frame = workspaceFrame(ctx.get(), 160, 48, 0)
  expect(frame.targets.filter((target) => target.id === 'media-models')).toHaveLength(1)
  expect(frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).toContain(
    'Enter a prompt, then Generate.'
  )
})
