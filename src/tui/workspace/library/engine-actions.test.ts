import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it, vi } from 'vitest'
import { DIGEST_A, installation, operation, plan } from '../../../../test/helpers/managed-fixtures.js'
import type { ManagedEngineState } from '../../../contract/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'

const state = (over: Partial<ManagedEngineState> = {}): ManagedEngineState => ({
  engine: 'vllm',
  environment_id: 'default',
  executor: 'linux-docker',
  plan: plan('vllm'),
  plan_error: null,
  notices: [],
  installation: null,
  operation: null,
  other_operation: null,
  failed: null,
  models_kept_for: [],
  update: null,
  ...over,
})

/** A TUI whose server answers `engines.plan` with `planned` and records every other call. */
function tui(
  planned: ManagedEngineState,
  answer: (name: string, input: Record<string, unknown>) => unknown = () => ({})
) {
  let s = { ...createWorkspace('models'), setupComplete: true }
  s.libraryView = 'engines'
  s.libraryRows = [{ id: 'vllm', name: 'vllm', category: 'engines', description: 'Not installed' }]
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) =>
    name === 'engines.plan' ? planned : answer(name, input)
  )
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, snapshot: async () => null, launch: async () => 'terminal' },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, execute, get: () => s }
}
const calls = (execute: ReturnType<typeof tui>['execute'], name: string) =>
  execute.mock.calls.filter(([n]) => n === name).map(([, input]) => input)

describe('the engine panel’s actions', () => {
  it('opens the panel for a managed engine instead of the operation runner', async () => {
    const t = tui(state())
    await activate('library-row:0', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'engine-panel', enginePanel: { engine: 'vllm' } })
    expect(calls(t.execute, 'engines.plan')).toEqual([{ engine: 'vllm' }])
    expect(t.get().operation).not.toBe('engines.install')
  })

  it('approves the shown plan by its digest under a terminal request id', async () => {
    const t = tui(state())
    await activate('library-row:0', t.ctx)
    await activate('engine-approve', t.ctx)
    expect(calls(t.execute, 'engines.operate')).toEqual([
      {
        engine: 'vllm',
        kind: 'setup',
        request_id: expect.stringMatching(/^terminal-/),
        approved_plan_digest: DIGEST_A,
      },
    ])
  })

  it('answers an operation waiting for consent with resume and the shown digest', async () => {
    const asking = operation('vllm', 'awaiting-consent', { plan_digest: DIGEST_A })
    const t = tui(state({ operation: asking }))
    await activate('library-row:0', t.ctx)
    await activate('engine-approve', t.ctx)
    expect(calls(t.execute, 'engines.resume')).toEqual([
      { operation_id: asking.operation_id, approved_plan_digest: DIGEST_A },
    ])
  })

  it('reads the plan again and says so when the core refuses a stale approval', async () => {
    const t = tui(state(), (name) => {
      if (name === 'engines.operate') throw new AtomicCoreError('MANAGED_PLAN_CHANGED', 'The plan changed.')
      return {}
    })
    await activate('library-row:0', t.ctx)
    await activate('engine-approve', t.ctx)
    expect(t.get().enginePanel?.notice).toMatch(/plan changed/i)
    expect(calls(t.execute, 'engines.plan')).toHaveLength(2)
  })

  it('cancels the running operation', async () => {
    const pulling = operation('vllm', 'pulling-image')
    const t = tui(state({ operation: pulling }))
    await activate('library-row:0', t.ctx)
    await activate('engine-cancel', t.ctx)
    expect(calls(t.execute, 'engines.cancel')).toEqual([{ operation_id: pulling.operation_id }])
  })

  it('removes the engine after showing the removal, keeping the models when asked', async () => {
    const t = tui(state({ installation: installation('vllm') }))
    await activate('library-row:0', t.ctx)
    await activate('engine-remove', t.ctx)
    expect(t.get().enginePanel?.removing).toBe(true)
    await activate('engine-keep-models', t.ctx)
    await activate('engine-remove-confirm', t.ctx)
    expect(calls(t.execute, 'engines.operate')).toEqual([
      {
        engine: 'vllm',
        kind: 'remove',
        request_id: expect.stringMatching(/^terminal-/),
        retain_models: true,
      },
    ])
    expect(t.get().enginePanel?.removing).toBe(false)
  })

  it('starts an update through engines.install', async () => {
    const t = tui(
      state({
        installation: installation('vllm'),
        update: {
          needed: true,
          target: { version: 'vllm-2', variant: 'linux/amd64' },
          apply: 'reinstall',
        } as never,
      })
    )
    await activate('library-row:0', t.ctx)
    await activate('engine-update', t.ctx)
    expect(calls(t.execute, 'engines.install')).toEqual([
      { engine: 'vllm', request: { request_id: expect.stringMatching(/^terminal-/) } },
    ])
  })
})
