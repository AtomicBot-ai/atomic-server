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
import type { CommandContext } from '../cli/index.js'
import { AtcError } from '../cli/index.js'
import type { ManagedEngineState, ManagedInstallResult } from '../contract/index.js'
import { readDaemonRecord } from '../core-link/index.js'
import { planBlocked, rebootLines, reloginLines, removalLines } from '../workspace-view/index.js'
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

const engineOf = (op: EnvironmentOperation) =>
  op.target.kind === 'runtime' ? op.target.engine_id : 'the managed environment'

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

async function settle(s: ManagedSession, op: EnvironmentOperation, approval?: Approval): Promise<number> {
  const engine = engineOf(op)
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
      const launch = (await readDaemonRecord(s.ctx.paths.daemonRecord))?.launch ?? 'terminal'
      for (const line of reloginLines(launch, op.operation_id)) say(line)
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
  const engine = engineOf(op)
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
    digest = await agree(s, `Installing ${engine}`, offered)
    if (digest === null) return nothingChanged(s)
  }
  const resumed = (await s.service.execute('engines.resume', {
    operation_id: op.operation_id,
    approved_plan_digest: digest,
  })) as EnvironmentOperation
  return run(s, resumed, { kind: op.kind === 'remove' ? 'remove' : 'setup', ...(digest ? { digest } : {}) })
}

function nothingChanged(s: ManagedSession): number {
  s.ctx.out.line('Nothing was changed.')
  return 0
}

function printRemoval(s: ManagedSession, state: ManagedEngineState, keepModels?: boolean): void {
  if (s.ctx.flags.json) s.ctx.io.stdout(`${JSON.stringify({ removal: state })}\n`)
  else for (const line of removalLines(state, keepModels)) s.ctx.out.line(line)
}

/** Consent to a removal: `--yes`, a "yes" on the terminal, or a usage error. */
async function agreeRemoval(s: ManagedSession, engine: string): Promise<boolean> {
  if (s.consent.kind === 'yes') return true
  if (s.consent.kind === 'ask') return s.ctx.prompt.confirm(`Remove ${engine}?`, { danger: true })
  throw new AtcError('ATC_USAGE', `Removing ${engine} needs your consent to the plan above.`, {
    hint: 'run it on a terminal, or add --yes to agree to it',
  })
}

/** `atc engines rm <managed> [--keep-models]`: the removal described, agreed to, then followed. */
export async function removeManagedEngine(
  ctx: CommandContext,
  engine: string,
  values: Record<string, unknown>
): Promise<number> {
  const s = await managedSession(ctx, values)
  try {
    const state = await engineState(s, engine)
    if (state.operation) {
      if (state.operation.kind === 'remove') return await continueOperation(s, state.operation)
      throw new AtcError('ATC_USAGE', `The ${state.operation.kind} of ${engine} is still running.`, {
        hint: `cancel it with atc engines install --cancel ${state.operation.operation_id}`,
      })
    }
    if (!state.installation) throw new AtcError('ATC_USAGE', `${engine} is not installed.`)
    const keep = values['keep-models'] === true
    printRemoval(s, state, keep)
    if (!(await agreeRemoval(s, engine))) return nothingChanged(s)
    const op = (await s.service.execute('engines.operate', {
      engine,
      kind: 'remove',
      request_id: typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID(),
      retain_models: keep,
    })) as EnvironmentOperation
    return await run(s, op, { kind: 'remove' })
  } finally {
    s.close()
  }
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
async function waitForOther(s: ManagedSession, other: EnvironmentOperation, engine: string) {
  s.ctx.io.stderr(
    `Waiting for the ${other.kind} of ${engineOf(other)} (${other.phase}) to finish: the core changes one managed engine at a time; ${engine} is next.\n`
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
    if (!(await waitForOther(s, state.other_operation, engine))) return s.interrupted() ? 130 : 0
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

/** The core's reinstall: its removal keeps the models, then a setup under `<request_id>:setup`. */
async function update(s: ManagedSession, engine: string, operationId: string, requestId: string) {
  const removal = (await s.service.execute('engines.operation', {
    operation_id: operationId,
  })) as EnvironmentOperation
  const { op, detached } = await track(s, removal)
  if (detached) return printDetached(s, op)
  if (op.phase !== 'removed') return settle(s, op)
  for (let tries = 0; tries < 60 && !s.signal.aborted; tries++) {
    const next = (await engineState(s, engine)).operation
    if (next?.request_id === `${requestId}:setup`) return continueOperation(s, next)
    await new Promise((r) => setTimeout(r, Math.min(1000, 50 * (tries + 1))))
  }
  throw new AtcError('ATC_INTERNAL', `The core did not begin the new setup of ${engine}.`, {
    hint: `run atc engines install ${engine} again`,
  })
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
    if (result.status === 'updating') return await update(s, engine, result.operation_id, result.request_id)
    return await setup(s, engine, requestId, values['dry-run'] === true, result.state)
  } finally {
    s.close()
  }
}
