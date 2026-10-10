/**
 * The managed-runtime contract `atc` speaks, from the core it embeds (`@atomic-chat/core/contracts`).
 * Only `EnvironmentOperationView` is local: the slice of an operation the host-step executor reads.
 */

import type { ManagedHostReceipt, ManagedHostStep, ManagedPhase } from '@atomic-chat/core/contracts'

export { MANAGED_HOST_ACTIONS } from '@atomic-chat/core/contracts'
export type {
  ManagedHostAction,
  ManagedHostReceipt,
  ManagedHostStep,
  ManagedPhase,
  Sha256Digest,
} from '@atomic-chat/core/contracts'

export const TERMINAL_PHASES: readonly ManagedPhase[] = ['ready', 'removed', 'cancelled', 'failed']

export type HostStepOutcomeKind = ManagedHostReceipt['outcome']

/** The slice of `EnvironmentOperation` the host-step executor reads. */
export interface EnvironmentOperationView {
  operation_id: string
  instance_id: string
  revision: number
  phase: ManagedPhase
  pending_host_step: ManagedHostStep | null
  completed_step_ids: string[]
}
