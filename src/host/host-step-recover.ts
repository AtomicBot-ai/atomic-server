import { basename } from 'node:path'
import type { HostStepResultFile } from './elevator.js'
import type { HostStepOutcomeKind } from './managed-types.js'
import type { HostStepJournalEntry } from './host-step.js'

export function requestStepId(requestPath: string): string {
  return basename(requestPath).replace(/\.request\.json$/, '')
}

/** A result is this step's only when its id is the request basename. Anything else is no result. */
export function acceptedResult(
  requestPath: string,
  result: HostStepResultFile | undefined
): HostStepResultFile | undefined {
  if (!result || result.step_id !== requestStepId(requestPath)) return undefined
  return result
}

export type StepRecovery =
  | { action: 'duplicate' }
  | { action: 'pending' }
  | { action: 'post'; outcome: HostStepOutcomeKind; logTail?: string }
  | { action: 'run' }

export function recoverHandledStep(
  existing: HostStepJournalEntry | undefined,
  result: HostStepResultFile | undefined
): StepRecovery {
  if (existing?.state === 'posted') return { action: 'duplicate' }
  if (existing?.state === 'pending-manual') return { action: 'pending' }
  if (existing?.state === 'ran') return { action: 'post', outcome: existing.outcome ?? 'failed' }
  if (existing?.state === 'requested' && result)
    return { action: 'post', outcome: result.outcome, logTail: result.log_tail }
  return { action: 'run' }
}

export function recoverPolledStep(
  entry: HostStepJournalEntry,
  result: HostStepResultFile | undefined
): { outcome: HostStepOutcomeKind; logTail?: string } | undefined {
  if (entry.state === 'ran') return { outcome: entry.outcome ?? 'failed' }
  if ((entry.state === 'pending-manual' || entry.state === 'requested') && result)
    return { outcome: result.outcome, logTail: result.log_tail }
  return undefined
}
