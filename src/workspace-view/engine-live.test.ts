import { describe, expect, it } from 'vitest'
import type { ManagedEngineState, WorkspaceSnapshot } from '../contract/index.js'
import { DIGEST_A, DIGEST_B, installation, operation, plan } from '../../test/helpers/managed-fixtures.js'
import { engineApproval, engineRefreshKey, liveEngineState } from './engine-live.js'

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
const live = (engines: WorkspaceSnapshot['engines']) => ({ engines }) as WorkspaceSnapshot

describe('the live engine state', () => {
  it('takes this engine’s operation and installation, and another engine’s operation, from the snapshot', () => {
    const other = operation('sglang', 'pulling-image')
    const merged = liveEngineState(
      state({ operation: operation('vllm', 'checking') }),
      live([
        { engine: 'vllm', installation: installation('vllm'), operation: null },
        { engine: 'sglang', installation: null, operation: other },
      ])
    )
    expect(merged).toMatchObject({
      operation: null,
      installation: installation('vllm'),
      other_operation: other,
    })
  })

  it('keeps the core’s answer without a snapshot', () => {
    const s = state({ operation: operation('vllm', 'checking') })
    expect(liveEngineState(s, null)).toBe(s)
  })

  it('changes its refresh key when the live operation starts, moves on or ends', () => {
    const at = (phase: string) =>
      live([{ engine: 'vllm', installation: null, operation: operation('vllm', phase as never) }])
    expect(engineRefreshKey('vllm', at('checking'))).not.toBe(engineRefreshKey('vllm', at('pulling-image')))
    expect(engineRefreshKey('vllm', live([]))).toBe('none')
  })
})

describe('engineApproval', () => {
  it('approves an installable plan by its digest, through operate', () => {
    expect(engineApproval(state())).toEqual({ via: 'operate', kind: 'setup', digest: DIGEST_A })
  })

  it('offers nothing while another engine’s operation runs, or for a blocked plan', () => {
    expect(engineApproval(state({ other_operation: operation('sglang', 'checking') }))).toBeNull()
    const blocked = plan('vllm', {
      availability: 'prerequisite-blocked',
      blockers: [{ code: 'X', message: 'no', commands: [] }] as never,
    })
    expect(engineApproval(state({ plan: blocked }))).toBeNull()
  })

  it('answers a waiting setup only for the plan it shows, through resume', () => {
    const asking = (digest: string) =>
      state({ operation: operation('vllm', 'awaiting-consent', { plan_digest: digest as never }) })
    expect(engineApproval(asking(DIGEST_A))).toEqual({ via: 'resume', kind: 'setup', digest: DIGEST_A })
    expect(engineApproval(asking(DIGEST_B))).toBeNull()
  })

  it('answers a waiting removal with its digest', () => {
    const removing = state({
      installation: installation('vllm'),
      operation: operation('vllm', 'awaiting-consent', { kind: 'remove', plan_digest: DIGEST_B as never }),
    })
    expect(engineApproval(removing)).toEqual({ via: 'resume', kind: 'remove', digest: DIGEST_B })
  })
})
