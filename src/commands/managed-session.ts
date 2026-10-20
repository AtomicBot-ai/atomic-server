/**
 * What `atc engines install|rm` needs around a managed engine's durable operation: the consent the
 * person gave on the command line, following the operation from this process (Ctrl-C and `--detach`
 * only stop the following), and the plan and phases printed the same way every time.
 */

import { AtomicCoreError } from '@atomic-chat/core'
import type { CoreEventMessage } from '@atomic-chat/core/client'
import type { EnvironmentOperation } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../cli/index.js'
import { AtcError } from '../cli/index.js'
import type { ManagedEngineState } from '../contract/index.js'
import { MANAGED_FINISHED_PHASES } from '../contract/index.js'
import type { CoreLink } from '../core-link/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { operationView, planLines } from '../workspace-view/index.js'
import { attachWorkspace } from './control.js'
import { follow, followDisplay } from './follow.js'

/** How the person consents to a plan: `--yes`, `--approve <digest>`, on the terminal, or not at all. */
export type Consent =
  { kind: 'yes' } | { kind: 'approve'; digest: string } | { kind: 'ask' } | { kind: 'none' }

export interface ManagedSession {
  ctx: CommandContext
  link: CoreLink
  service: WorkspaceClient
  consent: Consent
  detach: boolean
  signal: AbortSignal
  interrupted(): boolean
  close(): void
}

const DIGEST = /^sha256:[0-9a-f]{64}$/

export async function managedSession(
  ctx: CommandContext,
  values: Record<string, unknown>
): Promise<ManagedSession> {
  const approve = values['approve']
  if (typeof approve === 'string' && !DIGEST.test(approve))
    throw new AtcError('ATC_USAGE', 'Use --approve sha256:<64 hex digits>, the plan digest a plan printed.')
  const consent: Consent =
    typeof approve === 'string'
      ? { kind: 'approve', digest: approve }
      : ctx.flags.yes
        ? { kind: 'yes' }
        : ctx.io.isTTY.stdin && !ctx.flags.json
          ? { kind: 'ask' }
          : { kind: 'none' }
  const { link, service } = await attachWorkspace(ctx)
  const interrupt = new AbortController()
  const off = ctx.io.onInterrupt?.(() => interrupt.abort()) ?? (() => {})
  return {
    ctx,
    link,
    service,
    consent,
    detach: values['detach'] === true,
    signal: AbortSignal.any([ctx.signal, interrupt.signal]),
    interrupted: () => interrupt.signal.aborted || ctx.signal.aborted,
    close: off,
  }
}

export async function engineState(s: ManagedSession, engine: string): Promise<ManagedEngineState> {
  return (await s.service.execute('engines.plan', { engine })) as ManagedEngineState
}

/** The plan as the person reads it before consenting; one NDJSON line with `--json`. */
export function printState(s: ManagedSession, state: ManagedEngineState): void {
  if (s.ctx.flags.json) s.ctx.io.stdout(`${JSON.stringify({ plan: state })}\n`)
  else for (const line of planLines(state)) s.ctx.out.line(line)
}

/** Waiting on the person, or on a sign-in or restart: where following stops and the command acts. */
const STOPS: readonly string[] = [
  ...MANAGED_FINISHED_PHASES,
  'awaiting-consent',
  'relogin-required',
  'reboot-required',
]

/** Follow one operation from this process until it needs something or ends, or the person leaves. */
export async function track(
  s: ManagedSession,
  op: EnvironmentOperation
): Promise<{ op: EnvironmentOperation; detached: boolean }> {
  const display = followDisplay<EnvironmentOperation>(
    { io: s.ctx.io, progress: s.ctx.progress, flags: s.ctx.flags },
    operationView,
    (value) => ({ operation: value })
  )
  const result = await follow<EnvironmentOperation>({
    events: s.link.events,
    pick: (m: CoreEventMessage) =>
      m.event === 'environment:operation' && (m.data as EnvironmentOperation).operation_id === op.operation_id
        ? (m.data as EnvironmentOperation)
        : undefined,
    poll: async () =>
      (await s.service.execute('engines.operation', {
        operation_id: op.operation_id,
      })) as EnvironmentOperation,
    finished: (value) => STOPS.includes(value.phase),
    revision: (value) => value.revision,
    show: (value) => display.show(value),
    signal: s.signal,
    detach: s.detach,
  })
  display.close(result.kind === 'finished' && result.value.phase !== 'failed')
  return { op: result.value, detached: result.kind === 'detached' }
}

/** Following stopped, the work did not: say which operation goes on and how to follow it again. */
export function printDetached(s: ManagedSession, op: EnvironmentOperation): number {
  if (s.ctx.flags.json)
    s.ctx.io.stdout(`${JSON.stringify({ detached: true, operation_id: op.operation_id })}\n`)
  else {
    s.ctx.out.line(`Operation ${op.operation_id} goes on in the server.`)
    s.ctx.out.line(`Follow it again with: atc engines install --resume ${op.operation_id}`)
  }
  return s.interrupted() ? 130 : 0
}

/** The core's error that the plan is not the one approved, as it reported it when it did. */
export function planChanged(op: EnvironmentOperation): AtomicCoreError {
  return AtomicCoreError.fromBody(
    op.error?.code === 'MANAGED_PLAN_CHANGED'
      ? op.error
      : {
          code: 'MANAGED_PLAN_CHANGED',
          message: 'The plan changed since it was approved. Review the new plan above and approve it.',
        }
  )
}

/**
 * The digest the person agrees to for the plan just printed, or `null` when they said no. `--yes`
 * covers only that printed plan; `--approve` names its own; nothing on a terminal is a usage error.
 */
export async function agree(s: ManagedSession, what: string, digest: string): Promise<string | null> {
  switch (s.consent.kind) {
    case 'approve':
      return s.consent.digest
    case 'yes':
      return digest
    case 'ask':
      return (await s.ctx.prompt.confirm(`${what} with this plan?`)) ? digest : null
    case 'none':
      throw new AtcError('ATC_USAGE', `${what} needs your consent to the plan above.`, {
        hint: `run it on a terminal, add --yes to agree to the plan printed above, or --approve ${digest}`,
      })
  }
}
