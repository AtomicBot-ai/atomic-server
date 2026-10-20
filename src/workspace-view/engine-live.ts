/**
 * A managed engine as both UIs show it between two reads of the core's state (design D14–D16): the
 * snapshot's operation and installation are at most 2.5 s old and win over the last `engines.plan`
 * answer; a new read is due whenever the live operation starts, moves to another phase or ends; and
 * consent is offered only for the plan on screen — its digest, never another.
 */

import type { ManagedEngineState, WorkspaceSnapshot } from '../contract/index.js'
import { planBlocked } from './engines.js'

/** `state` with this engine's operation and installation, and another engine's operation, from `live`. */
export function liveEngineState(
  state: ManagedEngineState,
  live: WorkspaceSnapshot | null
): ManagedEngineState {
  if (!live?.engines) return state
  const mine = live.engines.find((e) => e.engine === state.engine)
  const other = live.engines.find((e) => e.engine !== state.engine && e.operation)?.operation ?? null
  return {
    ...state,
    operation: mine?.operation ?? null,
    installation: mine?.installation ?? null,
    other_operation: other,
  }
}

/** Changes whenever the live operation of `engine` starts, moves to another phase or ends. */
export function engineRefreshKey(engine: string, live: WorkspaceSnapshot | null): string {
  const op = live?.engines?.find((e) => e.engine === engine)?.operation
  return op ? `${op.operation_id}:${op.phase}:${op.plan_digest ?? ''}` : 'none'
}

export interface EngineApproval {
  /** `operate` begins the setup; `resume` answers an operation that waits for consent. */
  via: 'operate' | 'resume'
  kind: 'setup' | 'remove'
  digest: string
}

/** The consent a UI may offer for `state` (joined with the snapshot), bound to the plan it shows. */
export function engineApproval(state: ManagedEngineState): EngineApproval | null {
  const op = state.operation
  if (op?.phase === 'awaiting-consent') {
    if (!op.plan_digest) return null
    if (op.kind === 'remove') return { via: 'resume', kind: 'remove', digest: op.plan_digest }
    return state.plan?.plan_digest === op.plan_digest
      ? { via: 'resume', kind: 'setup', digest: op.plan_digest }
      : null
  }
  if (op || state.installation?.status === 'ready' || state.other_operation) return null
  if (!state.plan || planBlocked(state.plan) || state.plan.availability === 'unsupported') return null
  return { via: 'operate', kind: 'setup', digest: state.plan.plan_digest }
}
