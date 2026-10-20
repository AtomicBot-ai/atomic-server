/**
 * How a managed engine reads, in the same words for `atc engines install|status`, the terminal UI and
 * the admin (design D15): the plan the person agrees to, the blockers with their instructions, and
 * the phases of the core's operation. Pure: data in, lines out. Browser-safe: type imports only.
 */

import type {
  EnvironmentOperation,
  ManagedBlocker,
  ManagedPhase,
  RequirementPlan,
} from '@atomic-chat/core/contracts'
import type { ManagedEngineState } from '../contract/index.js'

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB']

/** Bytes as `atc` prints them everywhere: binary units, one decimal; `unknown` for no number. */
export function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'unknown'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${UNITS[unit]}`
}

/** A plan the core would not start: an unsupported host, or one with something in the way. */
export function planBlocked(plan: RequirementPlan): boolean {
  return (
    plan.availability === 'unsupported' ||
    plan.availability === 'prerequisite-blocked' ||
    plan.blockers.length > 0
  )
}

/** Each blocker in the core's words, then the exact commands that fix it by hand. */
export function blockerLines(blockers: readonly ManagedBlocker[]): string[] {
  return blockers.flatMap((b) => [`  - ${b.message}`, ...(b.commands ?? []).map((c) => `      ${c}`)])
}

/**
 * The whole plan before consent (spec "Установка managed-движка по плану с согласием"): the system
 * changes, the download and the disk, elevation, a sign-in or restart, warnings, the descriptor's
 * notices and the digest the consent binds to. A blocked plan is its blockers alone.
 */
export function planLines(state: ManagedEngineState): string[] {
  const plan = state.plan
  if (!plan)
    return [`${state.engine}: the core gave no plan${state.plan_error ? ` (${state.plan_error})` : ''}.`]
  if (planBlocked(plan))
    return [
      plan.availability === 'unsupported'
        ? `${state.engine} is not available on this machine:`
        : `${state.engine} cannot be installed on this machine yet:`,
      ...blockerLines(plan.blockers),
    ]
  const lines = [`Plan to install ${state.engine}${plan.descriptor_id ? ` (${plan.descriptor_id})` : ''}:`]
  if (plan.system_changes.length === 0)
    lines.push(
      plan.adopts_existing_engine
        ? '  No system changes: the container engine already on this machine is used.'
        : '  No system changes.'
    )
  else {
    lines.push('  System changes:')
    for (const change of plan.system_changes) lines.push(`    - ${change.text}`)
  }
  lines.push(`  Download: ${formatSize(plan.download_bytes)}`)
  const free =
    plan.free_disk_bytes !== null
      ? ` (${formatSize(plan.free_disk_bytes)} free${plan.docker_root_dir ? ` at ${plan.docker_root_dir}` : ''})`
      : ''
  lines.push(`  Disk needed: ${formatSize(plan.required_disk_bytes)}${free}`)
  lines.push(
    plan.requires_elevation
      ? '  Needs administrator rights once, for the system changes above.'
      : '  Needs no administrator rights.'
  )
  if (plan.may_require_relogin) lines.push('  You may need to sign in again for the docker group to apply.')
  if (plan.may_require_reboot) lines.push('  Windows may need a restart once WSL is turned on.')
  if (plan.warnings.length) {
    lines.push('  Warnings:')
    for (const warning of plan.warnings) lines.push(`    - ${warning.text}`)
  }
  if (state.notices.length) {
    lines.push('  Notices:')
    for (const notice of state.notices) lines.push(`    - ${notice}`)
  }
  lines.push(`  Plan digest: ${plan.plan_digest}`)
  return lines
}

export const PHASE_LABELS: Readonly<Record<ManagedPhase, string>> = {
  'checking': 'Checking the machine',
  'awaiting-consent': 'Waiting for consent to the plan',
  'preparing-host': 'Preparing the host',
  'relogin-required': 'Waiting for a new sign-in',
  'reboot-required': 'Waiting for a restart',
  'preparing-environment': 'Preparing the environment',
  'pulling-image': 'Downloading the engine image',
  'verifying': 'Verifying',
  'activating': 'Activating',
  'removing': 'Removing',
  'ready': 'Ready',
  'removed': 'Removed',
  'cancelling': 'Cancelling',
  'cancelled': 'Cancelled',
  'failed': 'Failed',
}

/** One operation state on a line: its phase, the step it waits on, and bytes when it counts them. */
export function operationView(op: EnvironmentOperation): {
  stage: string
  text: string
  done: number | null
  total: number | null
} {
  const engine = op.target.kind === 'runtime' ? op.target.engine_id : 'environment'
  const waitsForStep = op.phase === 'preparing-host' && op.pending_host_step !== null
  const label = waitsForStep ? 'Waiting for the privileged step' : PHASE_LABELS[op.phase]
  const bytes = op.progress?.unit === 'bytes' ? op.progress : null
  return {
    stage: `${op.operation_id}:${op.phase}${waitsForStep ? ':step' : ''}`,
    text: `${engine} ${op.kind}: ${label}${op.cancellation_requested && op.phase !== 'cancelled' ? ' (cancelling)' : ''}`,
    done: bytes?.completed ?? null,
    total: bytes?.total ?? null,
  }
}
