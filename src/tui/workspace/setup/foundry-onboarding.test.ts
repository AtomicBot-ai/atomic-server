import { expect, it, vi } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import { canvas } from '../draw/canvas.js'
import { drawVariantModelChoice } from './variant-model-choice-view.js'
import { createWorkspace } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { engineSetupRows } from './engine-setup-rows.js'
import { firstRunAction } from './first-run.js'

function fixture(engine = 'foundry-local') {
  const kind = engine === 'litert-lm' ? 'litert' : 'foundry'
  let state = {
    ...createWorkspace('setup'),
    engine,
    firstRun: 'model' as const,
    setup: {
      ...newSetup('server'),
      engine,
      stage: 'models' as const,
      path: {
        kind: kind as 'foundry' | 'litert',
        engine,
        plan: null,
        job: null,
        rows: [{ id: 'phi', title: 'Phi', detail: '' }],
      },
    },
  }
  const execute = vi.fn(async (name: string) =>
    name === 'models.search'
      ? {
          models: [
            {
              model_id: 'phi',
              name: 'Phi',
              default_variant: 'gpu',
              variants: [
                {
                  id: 'gpu',
                  backend: 'gpu',
                  file: { size: 1024 },
                  device: 'gpu',
                  execution_provider: 'webgpu',
                  size_bytes: 1024,
                  verdict: {
                    verdict: 'accelerator-not-prepared',
                    reason: 'Prepare WebGPU',
                    accelerator: 'webgpu',
                  },
                },
                {
                  id: 'cpu',
                  backend: 'cpu',
                  file: { size: 2048 },
                  device: 'cpu',
                  execution_provider: 'cpu',
                  size_bytes: 2048,
                  verdict: { verdict: 'ok', reason: null, accelerator: null },
                },
              ],
            },
          ],
        }
      : name === `${kind}.plan`
        ? { digest: 'cpu-plan', variant_id: 'cpu', blockers: [] }
        : {}
  )
  const save = vi.fn()
  const ctx = {
    get: () => state,
    update: (fn: Parameters<ActionContext['update']>[0]) => {
      state = fn(state) as typeof state
    },
    controller: {
      runtime: { execute },
      setup: { savePath: vi.fn() },
      save,
    } as unknown as WorkspaceController,
  } as ActionContext
  return { ctx, execute, save, state: () => state }
}

it.each(['foundry-local', 'litert-lm'])(
  'chooses an explicit %s variant before advancing onboarding',
  async (engine) => {
    const kind = engine === 'litert-lm' ? 'litert' : 'foundry'
    const { ctx, execute, save, state } = fixture(engine)
    await firstRunAction('first-model-continue', ctx)
    expect(state().firstRun).toBe('model')
    expect(state().overlay).toBe('variant-model-choice')
    expect(execute).not.toHaveBeenCalledWith(`${kind}.plan`, expect.anything())
    await firstRunAction('variant-choice:1', ctx)
    expect(state().firstRun).toBe('model')
    await firstRunAction('variant-choice-download', ctx)
    expect(execute).toHaveBeenCalledWith(`${kind}.plan`, { model: 'phi', variant: 'cpu' })
    expect(execute).toHaveBeenCalledWith(
      `${kind}.install`,
      expect.objectContaining({ plan_digest: 'cpu-plan' })
    )
    expect(save).toHaveBeenCalledWith('tui.model', 'cpu')
    expect(state().firstRun).toBe('permissions')
  }
)

it('shows device choices, blocks an unprepared variant and returns to models on Back', async () => {
  const { ctx, execute, state } = fixture()
  await firstRunAction('first-model-continue', ctx)
  const drawing = canvas(100, 30)
  drawVariantModelChoice(drawing, state(), 'variant-choice:0')
  const screen = drawing.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(screen).toContain('WebGPU')
  expect(screen).toContain('CPU')
  expect(screen).toContain('Needs preparation')
  expect(drawing.targets.some((t) => t.id === 'variant-choice-download')).toBe(false)
  await firstRunAction('variant-choice-download', ctx)
  expect(execute.mock.calls.some(([name]) => name === 'foundry.install')).toBe(false)
  await firstRunAction('close', ctx)
  expect(state().overlay).toBeNull()
  expect(state().firstRun).toBe('model')
})

it('keeps the choice after a save failure and retries the same download request', async () => {
  const { ctx, execute, save, state } = fixture()
  save.mockRejectedValueOnce(new Error('Cannot save preferences'))
  await firstRunAction('first-model-continue', ctx)
  await firstRunAction('variant-choice:1', ctx)
  await firstRunAction('variant-choice-download', ctx)
  expect(state().firstRun).toBe('model')
  expect(state().variantModelChoice?.error).toBe('Cannot save preferences')
  await firstRunAction('variant-choice-download', ctx)
  const requests = execute.mock.calls.filter(([name]) => name === 'foundry.install')
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect(state().firstRun).toBe('permissions')
})

it('ignores a stale catalog reply after closing and reopening the same model', async () => {
  const { ctx, execute, state } = fixture()
  let finish!: (value: never) => void
  execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const first = firstRunAction('first-model-continue', ctx)
  await firstRunAction('close', ctx)
  await firstRunAction('first-model-continue', ctx)
  const current = state().variantModelChoice
  finish({ models: [] } as never)
  await first
  expect(state().variantModelChoice).toBe(current)
  expect(state().variantModelChoice?.error).toBe('')
})

it('can reach device variants beyond the visible terminal rows', async () => {
  const { ctx, state } = fixture()
  await firstRunAction('first-model-continue', ctx)
  ctx.update((s) => ({
    ...s,
    variantModelChoice: {
      ...s.variantModelChoice!,
      variants: Array.from({ length: 30 }, (_, i) => ({
        ...s.variantModelChoice!.variants[1]!,
        id: String(i),
        label: `Device ${i}`,
      })),
    },
  }))
  let drawing = canvas(80, 24)
  drawVariantModelChoice(drawing, state(), state().focus)
  for (const last of [19, 29]) {
    const more = drawing.targets.find((t) => t.id === `variant-choice-page:${last}`)!
    expect(more).toBeDefined()
    ctx.update((s) => ({ ...s, focus: more.id }))
    drawing = canvas(80, 24)
    drawVariantModelChoice(drawing, state(), state().focus)
    expect(drawing.targets.some((t) => t.id === more.id)).toBe(true)
    await firstRunAction(more.id, ctx)
    drawing = canvas(80, 24)
    drawVariantModelChoice(drawing, state(), state().focus)
    expect(drawing.targets.some((t) => t.id === `variant-choice:${last}`)).toBe(true)
  }
  expect(state().variantModelChoice?.selected).toBe(0)
})

it.each(['foundry-local', 'litert-lm'])(
  'shows %s devices before any default variant is ready',
  async (engine) => {
    const { ctx, state } = fixture(engine)
    const rows = await engineSetupRows(ctx.controller, state().setup.path, '')
    expect(rows[0]?.detail).toBe(engine === 'litert-lm' ? 'GPU · CPU' : 'WebGPU · CPU')
  }
)

it('returns from engine preparation to the same variant choice with fresh verdicts', async () => {
  const { ctx, state } = fixture()
  await firstRunAction('first-model-continue', ctx)
  await firstRunAction('variant-choice:1', ctx)
  ctx.update((s) => ({ ...s, overlay: 'engine-panel', enginePanel: { engine: 'foundry-local' } as never }))
  await firstRunAction('close', ctx)
  expect(state().overlay).toBe('variant-model-choice')
  expect(state().variantModelChoice?.selected).toBe(1)
  expect(state().enginePanel).toBeNull()
})
