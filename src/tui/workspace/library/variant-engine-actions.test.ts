import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { variantEngineAction } from './variant-engine-actions.js'

/** An open engine panel for Foundry Local or LiteRT-LM, and a runtime answering each operation. */
function panel(
  kind: 'foundry' | 'litert',
  answers: Record<string, unknown>,
  data: Record<string, unknown> = {}
) {
  let s: WorkspaceState = {
    ...createWorkspace('models'),
    setupComplete: true,
    enginePanel: {
      engine: kind === 'foundry' ? 'foundry-local' : 'litert-lm',
      kind,
      mode: 'engine',
      busy: false,
      error: '',
      notice: '',
      seen: '',
      foundry: null,
      [kind]: { view: null, search: null, plan: null, ...data },
    } as never,
  }
  const execute = vi.fn(async (name: string, _input?: unknown) => {
    const answer = answers[name]
    if (answer instanceof Error) throw answer
    return answer
  })
  const ctx = {
    get: () => s,
    update: (fn: (v: WorkspaceState) => WorkspaceState) => (s = fn(s)),
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  } as unknown as ActionContext
  return { ctx, execute, get: () => s }
}
const view = (prepared: boolean) => ({ accelerators: [{ name: 'openvino', prepared }] })

describe('the Foundry Local and LiteRT-LM panels', () => {
  it('prepare Foundry Local after every install, as a new build drops what the old one registered', async () => {
    const { ctx, execute } = panel('foundry', { 'engines.install': {}, 'foundry.prepare': view(true) })
    await variantEngineAction('foundry-install', ctx)
    expect(execute.mock.calls.map(([n]) => n)).toEqual(['engines.install', 'foundry.prepare'])
  })

  it.each([
    [true, ['engines.install', 'litert.accelerators']],
    [false, ['engines.install', 'litert.accelerators', 'litert.prepare']],
  ])(
    'prepare LiteRT-LM only when the core offers an accelerator not prepared yet (prepared: %s)',
    async (prepared, calls) => {
      const { ctx, execute } = panel('litert', {
        'engines.install': {},
        'litert.accelerators': view(prepared),
        'litert.prepare': view(true),
      })
      await variantEngineAction('litert-install', ctx)
      expect(execute.mock.calls.map(([n]) => n)).toEqual(calls)
    }
  )

  it.each([
    ['foundry', 'gemma-npu runs on NPU once it is prepared: Prepare accelerators.', { accelerator: 'NPU' }],
    ['litert', 'gemma-npu runs on the NPU once openvino is prepared: Prepare accelerator.', {}],
  ] as const)(
    'send %s back to Prepare for a variant waiting on its accelerator',
    async (kind, notice, extra) => {
      const search = {
        models: [
          {
            model_id: 'gemma',
            variants: [{ id: 'gemma-npu', verdict: { verdict: 'accelerator-not-prepared', ...extra } }],
          },
        ],
      }
      const { ctx, get, execute } = panel(kind, {}, { search })
      await variantEngineAction(`${kind}-variant:gemma:gemma-npu`, ctx)
      expect(get().enginePanel).toMatchObject({ mode: 'engine', notice })
      expect(execute).not.toHaveBeenCalled()
    }
  )

  it.each(['foundry', 'litert'] as const)(
    'download %s’s plan under one request id, so a retry continues the job the server may hold',
    async (kind) => {
      const plan = { digest: 'plan-1', variant_id: 'v1' }
      const { ctx, execute } = panel(kind, { [`${kind}.install`]: new Error('connection reset') }, { plan })
      await variantEngineAction(`${kind}-download`, ctx)
      await variantEngineAction(`${kind}-download`, ctx)
      const ids = execute.mock.calls
        .filter(([n]) => n === `${kind}.install`)
        .map(([, input]) => (input as { request_id: string }).request_id)
      expect(ids).toEqual(['terminal-plan-1', 'terminal-plan-1'])
    }
  )

  it('leave an id of another panel to the next action', async () => {
    const { ctx } = panel('foundry', {})
    expect(await variantEngineAction('litert-install', ctx)).toBe(false)
    expect(await variantEngineAction('engine-open:x', ctx)).toBe(false)
  })
})
