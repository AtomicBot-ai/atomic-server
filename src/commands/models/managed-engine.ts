/**
 * `atc engines install <managed>` (spec `managed-engines-server`): the core's plan printed whole, the
 * person's consent bound to its digest, the durable operation followed from here while the server does
 * the work, and `--resume` / `--cancel` for one already running. An installed engine with a newer
 * release is updated the same way: the core removes it keeping the models, then its new setup asks for
 * consent like any setup.
 */

import { randomUUID } from 'node:crypto'
import { AtomicCoreError } from '@atomic-chat/core'
import type { EnvironmentOperation } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../../cli/index.js'
import { AtcError } from '../../cli/index.js'
import type { ManagedEngineState, ManagedInstallResult } from '../../contract/index.js'
import { readDaemonRecord } from '../../core-link/index.js'
import { followUpdate, updateWithConsent } from './managed-update.js'
import {
  operationEngine,
  planBlocked,
  rebootLines,
  reloginLines,
  removalLines,
} from '../../workspace-view/index.js'
import type { ManagedSession } from './managed-session.js'
import {
  agree,
  engineState,
  managedSession,
  planChanged,
  printDetached,
  printState,
  track,
} from './managed-session.js'

/**
 * What the person agreed to in this call: a setup plan by its digest, or a removal (whose plan the
 * core offers only once it began). `digest` is the one already sent, so the core asking for it again
 * is an error rather than a reason to agree again.
 */
export interface Approval {
  kind: 'setup' | 'remove'
  digest?: string
}

/** Follow `op` and act where it stops: done, failed, or waiting for consent, a sign-in or a restart. */
export async function run(s: ManagedSession, op: EnvironmentOperation, approval?: Approval): Promise<number> {
  const { op: last, detached } = await track(s, op)
  if (detached) return printDetached(s, last)
  return settle(s, last, approval)
}

export async function settle(
  s: ManagedSession,
  op: EnvironmentOperation,
  approval?: Approval
): Promise<number> {
  const engine = operationEngine(op)
  const say = (text: string) => s.ctx.out.line(text)
  switch (op.phase) {
    case 'ready':
      say(`${engine} is installed and ready.`)
      return 0
    case 'removed':
      say(`${engine} was removed.`)
      return 0
    case 'awaiting-consent':
      return consentFor(s, op, approval)
    case 'relogin-required': {
      const record = await readDaemonRecord(s.ctx.paths.daemonRecord)
      for (const line of reloginLines(record?.launch ?? 'terminal', op.operation_id, record?.service))
        say(line)
      return 0
    }
    case 'reboot-required':
      for (const line of rebootLines(op.operation_id)) say(line)
      return 0
    case 'cancelled':
      say(`The ${op.kind} of ${engine} was cancelled.`)
      return 1
    default:
      s.ctx.io.stderr(`Continue it with: atc engines install --resume ${op.operation_id}\n`)
      throw AtomicCoreError.fromBody(
        op.error ?? { code: 'INTERNAL', message: `The ${op.kind} of ${engine} failed.` }
      )
  }
}

/**
 * The core waits for consent: to a plan nobody approved yet, or to a new one after the machine
 * changed. The plan is read and printed again; an approval of another plan does not carry over. A
 * removal the person agreed to in this call is approved as the core offers it.
 */
async function consentFor(s: ManagedSession, op: EnvironmentOperation, approval?: Approval): Promise<number> {
  const engine = operationEngine(op)
  const offered = op.plan_digest
  if (offered && approval?.digest === offered)
    throw new AtcError(
      'ATC_INTERNAL',
      `The core asked again for consent to the plan already approved for ${engine}.`,
      {
        hint: `see atc engines status ${engine}`,
      }
    )
  const state = await engineState(s, engine)
  let digest: string | null
  if (op.kind === 'remove') {
    if (approval?.kind !== 'remove') {
      printRemoval(s, state)
      if (!(await agreeRemoval(s, engine))) return nothingChanged(s)
    }
    s.ctx.out.line(`Removal digest: ${offered ?? 'none offered'}`)
    if (s.consent.kind === 'approve' && s.consent.digest !== offered) {
      await s.service.execute('engines.cancel', { operation_id: op.operation_id })
      throw planChanged(op)
    }
    digest = offered
  } else {
    printState(s, state)
    if (
      !offered ||
      state.plan?.plan_digest !== offered ||
      approval?.digest !== undefined ||
      (s.consent.kind === 'approve' && s.consent.digest !== offered)
    )
      throw planChanged(op)
    // An update's setup offers the plan the person agreed to before the reinstall: not asked twice.
    digest = s.agreed === offered ? offered : await agree(s, `Installing ${engine}`, offered)
    if (digest === null) return nothingChanged(s)
  }
  const resumed = (await s.service.execute('engines.resume', {
    operation_id: op.operation_id,
    approved_plan_digest: digest,
  })) as EnvironmentOperation
  return run(s, resumed, { kind: op.kind === 'remove' ? 'remove' : 'setup', ...(digest ? { digest } : {}) })
}

export function nothingChanged(s: ManagedSession): number {
  s.ctx.out.line('Nothing was changed.')
  return 0
}

export function printRemoval(s: ManagedSession, state: ManagedEngineState, keepModels?: boolean): void {
  if (s.ctx.flags.json) s.ctx.io.stdout(`${JSON.stringify({ removal: state })}\n`)
  else for (const line of removalLines(state, keepModels)) s.ctx.out.line(line)
}

/** Consent to a removal: `--yes`, a "yes" on the terminal, or a usage error. */
export async function agreeRemoval(s: ManagedSession, engine: string): Promise<boolean> {
  // --approve: the core offers the removal plan's digest once it begins; it is compared then.
  if (s.consent.kind === 'yes' || s.consent.kind === 'approve') return true
  if (s.consent.kind === 'ask') return s.ctx.prompt.confirm(`Remove ${engine}?`, { danger: true })
  throw new AtcError('ATC_USAGE', `Removing ${engine} needs your consent to the plan above.`, {
    hint: 'run it on a terminal, or add --yes to agree to it',
  })
}

/** An operation found by id or left from before: join it where it stands. */
export async function continueOperation(s: ManagedSession, op: EnvironmentOperation): Promise<number> {
  if (op.phase === 'ready' || op.phase === 'removed') return settle(s, op)
  if (op.phase === 'awaiting-consent') return consentFor(s, op)
  if (['failed', 'cancelled', 'relogin-required', 'reboot-required'].includes(op.phase)) {
    const resumed = (await s.service.execute('engines.resume', {
      operation_id: op.operation_id,
    })) as EnvironmentOperation
    return run(s, resumed)
  }
  return run(s, op)
}

/** Another engine's operation runs first: show it, wait for it; `false` when following stopped. */
/** Phases an operation leaves only when a person acts: consent, a new sign-in, a restart. */
const PERSON: readonly string[] = ['awaiting-consent', 'relogin-required', 'reboot-required']

async function waitForOther(s: ManagedSession, other: EnvironmentOperation, engine: string) {
  s.ctx.io.stderr(
    `Waiting for the ${other.kind} of ${operationEngine(other)} (${other.phase}) to finish: the core changes one managed engine at a time; ${engine} is next.\n`
  )
  const { op, detached } = await track(s, other)
  if (detached) printDetached(s, op)
  return !detached
}

async function setup(
  s: ManagedSession,
  engine: string,
  requestId: string,
  dryRun: boolean,
  first: ManagedEngineState
): Promise<number> {
  let state = first
  for (;;) {
    if (state.operation) return continueOperation(s, state.operation)
    if (!state.other_operation) break
    // An operation waiting for a person ends only when they act: waiting here would never end.
    const other = state.other_operation
    if (PERSON.includes(other.phase))
      throw new AtcError(
        'ATC_USAGE',
        `The ${other.kind} of ${operationEngine(other)} waits for you (${other.phase}); the core changes one managed engine at a time.`,
        {
          hint: `continue it with atc engines install --resume ${other.operation_id}, or stop it with --cancel ${other.operation_id}`,
        }
      )
    if (!(await waitForOther(s, other, engine))) return s.interrupted() ? 130 : 0
    state = await engineState(s, engine)
  }
  printState(s, state)
  const plan = state.plan
  if (!plan)
    throw new AtcError('ATC_INTERNAL', `The core gave no plan for ${engine}.`, {
      details: state.plan_error ?? '',
    })
  if (planBlocked(plan))
    throw AtomicCoreError.fromBody({
      code: 'MANAGED_PREREQUISITE_BLOCKED',
      message: `${engine} cannot be installed on this machine; see the blockers above.`,
    })
  if (dryRun) return 0
  const digest = await agree(s, `Installing ${engine}`, plan.plan_digest)
  if (digest === null) return nothingChanged(s)
  const op = (await s.service.execute('engines.operate', {
    engine,
    kind: 'setup',
    request_id: requestId,
    approved_plan_digest: digest,
  })) as EnvironmentOperation
  return run(s, op, { kind: 'setup', digest })
}

export async function installManagedEngine(
  ctx: CommandContext,
  engine: string | undefined,
  values: Record<string, unknown>
): Promise<number> {
  const s = await managedSession(ctx, values)
  try {
    const resume = values['resume'],
      cancel = values['cancel']
    if (typeof cancel === 'string') {
      const op = (await s.service.execute('engines.cancel', { operation_id: cancel })) as EnvironmentOperation
      ctx.out.result(op, () =>
        ctx.out.line(
          op.phase === 'cancelled'
            ? `Operation ${op.operation_id} was cancelled.`
            : `Cancellation of ${op.operation_id} requested: the core stops at the next safe boundary of ${op.phase}.`
        )
      )
      return 0
    }
    if (typeof resume === 'string')
      return await continueOperation(
        s,
        (await s.service.execute('engines.operation', { operation_id: resume })) as EnvironmentOperation
      )
    if (!engine) throw new AtcError('ATC_USAGE', 'Name the engine to install.')
    const requestId = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
    const result = (await s.service.execute('engines.install', {
      engine,
      request: { request_id: requestId },
    })) as ManagedInstallResult
    if (result.status === 'ready') {
      ctx.out.result(result, () =>
        ctx.out.line(`${engine} is installed and ready (${result.active.version}).`)
      )
      return 0
    }
    // Awaited here: the Ctrl-C handler must stay until the following ends.
    if (result.status === 'updating')
      return await followUpdate(s, engine, result.operation_id, result.request_id)
    if (result.status === 'update')
      return await updateWithConsent(s, result, requestId, values['dry-run'] === true)
    return await setup(s, engine, requestId, values['dry-run'] === true, result.state)
  } finally {
    s.close()
  }
}
