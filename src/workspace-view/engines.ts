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
import type { ManagedEngineState, ManagedVerdict, ServerLaunch } from '../contract/index.js'

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

/** The phase of an operation as a person reads it, with the step it waits on and a pending cancel. */
export function phaseText(op: EnvironmentOperation): string {
  const label =
    op.phase === 'preparing-host' && op.pending_host_step !== null
      ? 'Waiting for the privileged step'
      : PHASE_LABELS[op.phase]
  return `${label}${op.cancellation_requested && op.phase !== 'cancelled' ? ' (cancelling)' : ''}`
}

/** One operation state on a line: its phase, the step it waits on, and bytes when it counts them. */
export function operationView(op: EnvironmentOperation): {
  stage: string
  text: string
  done: number | null
  total: number | null
} {
  const engine = op.target.kind === 'runtime' ? op.target.engine_id : 'environment'
  const bytes = op.progress?.unit === 'bytes' ? op.progress : null
  return {
    stage: `${op.operation_id}:${op.phase}${op.pending_host_step ? ':step' : ''}`,
    text: `${engine} ${op.kind}: ${phaseText(op)}`,
    done: bytes?.completed ?? null,
    total: bytes?.total ?? null,
  }
}

/**
 * What removing a managed engine does (spec "Удаление managed-движка"): its containers, image and
 * caches go; the shared store's models stay for every other managed engine installed, or when kept.
 * `keepModels` is the person's choice, `undefined` when it was made when the removal began.
 */
export function removalLines(state: ManagedEngineState, keepModels?: boolean): string[] {
  const descriptor = state.installation?.active_descriptor_id
  const lines = [
    `Plan to remove ${state.engine}${descriptor ? ` (${descriptor})` : ''}:`,
    `  - Unload any loaded ${state.engine} model and remove its containers.`,
    '  - Remove the engine image and the caches built for it.',
  ]
  if (state.models_kept_for.length)
    lines.push(`  - Models in the shared store stay: kept for ${state.models_kept_for.join(', ')}.`)
  else if (keepModels === true) lines.push('  - Models in the shared store stay: kept as asked.')
  else if (keepModels === false)
    lines.push('  - Models in the shared store are removed: no other managed engine uses them.')
  else lines.push('  - Models in the shared store stay or go as chosen when this removal began.')
  if (state.plan?.required_disk_bytes)
    lines.push(
      `  Frees up to about ${formatSize(state.plan.required_disk_bytes)} of engine image and caches.`
    )
  lines.push('  Docker itself, other containers and other WSL distributions are not touched.')
  return lines
}

/** Where a managed engine stands, in the order the desktop app decides it (`setup-view.ts`). */
export type EngineViewKind =
  | 'checking'
  | 'unsupported'
  | 'blocked'
  | 'installable'
  | 'operation'
  | 'consent'
  | 'host-step'
  | 'relogin'
  | 'reboot'
  | 'failed'
  | 'ready'
  | 'update'

export interface EngineView {
  kind: EngineViewKind
  /** One line: what a list shows for the engine. */
  summary: string
  operation: EnvironmentOperation | null
}

const STEP: Partial<Record<ManagedPhase, EngineViewKind>> = {
  'awaiting-consent': 'consent',
  'relogin-required': 'relogin',
  'reboot-required': 'reboot',
}

/**
 * A running operation outranks everything (the plan may be stale because of it), then the installed
 * engine and its update, then a failure to retry, then what the last probe said.
 */
export function engineView(state: ManagedEngineState): EngineView {
  const op = state.operation
  if (op) {
    const kind =
      op.phase === 'preparing-host' && op.pending_host_step ? 'host-step' : (STEP[op.phase] ?? 'operation')
    return { kind, summary: `${op.kind}: ${phaseText(op)} (${op.operation_id})`, operation: op }
  }
  const installed = state.installation
  if (installed?.status === 'ready') {
    const target = state.update?.needed ? state.update.target?.version : undefined
    return {
      kind: target ? 'update' : 'ready',
      summary: `installed (${installed.active_descriptor_id ?? 'unknown release'})${target ? `; update available: ${target}` : ''}`,
      operation: null,
    }
  }
  if (state.failed)
    return {
      kind: 'failed',
      summary: `last setup failed: ${state.failed.error?.message ?? 'unknown error'} (${state.failed.operation_id})`,
      operation: state.failed,
    }
  const plan = state.plan
  if (!plan)
    return {
      kind: 'checking',
      summary: state.plan_error ? `cannot check: ${state.plan_error}` : 'checking',
      operation: null,
    }
  if (plan.availability === 'unsupported')
    return { kind: 'unsupported', summary: 'not available on this machine', operation: null }
  if (planBlocked(plan))
    return {
      kind: 'blocked',
      summary: `blocked: ${plan.blockers[0]?.message ?? plan.availability}`,
      operation: null,
    }
  return {
    kind: 'installable',
    summary: `not installed; install ${plan.system_changes.length ? 'needs system changes' : 'needs no system changes'}`,
    operation: null,
  }
}

/**
 * After the person was added to the `docker` group (`relogin-required`): how the group reaches this
 * server, by the way it was started (design D5). `atc` never signs anyone out or restarts the machine.
 */
export function reloginLines(launch: ServerLaunch, operationId: string): string[] {
  const steps: Record<ServerLaunch, string[]> = {
    'terminal': [
      'The server was started from a terminal: sign out and in again (a new SSH session too),',
      'then run `atc restart` from the new session.',
    ],
    'launchd': ['Sign out and in again, then run `atc restart`.'],
    'systemd-user': [
      'The server runs as a systemd --user service, which keeps the groups of your user manager:',
      'end all your sessions (or restart the machine yourself), sign in again,',
      'then `systemctl --user start atc` if it is not running.',
    ],
    'systemd-system': ['The server runs as a system service: restart it with `sudo systemctl restart atc`.'],
  }
  return [
    'You were added to the docker group; it reaches the server only once the server starts again with it.',
    ...steps[launch],
    `The operation then continues by itself; follow it with: atc engines install --resume ${operationId}`,
  ]
}

/** After WSL was turned on (`reboot-required`, Windows): the next start of the server continues. */
export function rebootLines(operationId: string): string[] {
  return [
    'Windows needs a restart to finish turning on WSL.',
    'After the restart, `atc start` (or the service) continues the operation with the import of the distribution;',
    `follow it with: atc engines install --resume ${operationId}`,
  ]
}

/** One managed engine's verdict on a checkpoint, on one line, with the core's numbers. */
export function verdictLine(v: ManagedVerdict): string {
  const name = `${v.engine}${v.installed ? ' (installed)' : ''}`
  const c = v.compatibility
  if (!c) return `${name}: no verdict — ${v.error?.message ?? 'unknown'} [${v.error?.code ?? '?'}]`
  const others = c.fits_other_gpus.length ? `; fits ${c.fits_other_gpus.join(', ')}` : ''
  const warnings = (c.warnings ?? []).map((w) => `; warning: ${w.message}`).join('')
  if (!c.verdict.ok) {
    // The core's numbers (`required=10.0 actual=8.9`) travel in details, beside the card it checked.
    const details = (c.verdict.error as { details?: unknown }).details
    const facts = [typeof details === 'string' && details ? details : '', `on ${c.checked_gpu_id}`]
      .filter(Boolean)
      .join(' ')
    return `${name}: refused — ${c.verdict.error.message} (${facts}) [${c.verdict.error.code}]${others}${warnings}`
  }
  const facts = [
    c.architectures.join(', '),
    c.quantization_format ?? 'unquantized',
    formatSize(c.weight_bytes),
  ]
  return `${name}: ok — ${facts.join(', ')} on ${c.checked_gpu_id}${c.curated ? ' (curated)' : ''}${others}${warnings}`
}
