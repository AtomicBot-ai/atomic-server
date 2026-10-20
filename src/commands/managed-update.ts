/**
 * Updating an installed managed engine (spec managed-engines-server, "Обновление managed-движка"): the
 * core's reinstall begins by removing the installed image (models stay), so the person agrees first, to
 * the new release's plan; its setup then offers that same plan and is not asked about twice.
 */

import { AtcError } from '../cli/index.js'
import type { EnvironmentOperation } from '@atomic-chat/core/contracts'
import type { ManagedInstallResult } from '../contract/index.js'
import { planBlocked, updateLine } from '../workspace-view/index.js'
import { continueOperation, nothingChanged, settle } from './managed-engine.js'
import type { ManagedSession } from './managed-session.js'
import { agree, engineState, printDetached, printState, track } from './managed-session.js'

type UpdateOffer = Extract<ManagedInstallResult, { status: 'update' }>

export async function updateWithConsent(
  s: ManagedSession,
  offer: UpdateOffer,
  requestId: string,
  dryRun: boolean
): Promise<number> {
  const { engine } = offer
  s.ctx.out.line(updateLine(engine, offer.from, offer.target))
  printState(s, offer.state)
  const offered = offer.state.plan?.plan_digest
  if (!offered || planBlocked(offer.state.plan!))
    throw new AtcError('ATC_USAGE', `${engine} cannot be updated on this machine now; see the plan above.`)
  if (dryRun) return 0
  const digest = await agree(s, `Updating ${engine}`, offered)
  if (digest === null) return nothingChanged(s)
  s.agreed = digest
  const started = (await s.service.execute('engines.install', {
    engine,
    request: { request_id: requestId, approved_update: offer.target },
  })) as ManagedInstallResult
  if (started.status !== 'updating')
    throw new AtcError('ATC_INTERNAL', `The core did not begin the update of ${engine}.`)
  return followUpdate(s, engine, started.operation_id, started.request_id)
}

/** The core's reinstall: its removal keeps the models, then a setup under `<request_id>:setup`. */
export async function followUpdate(
  s: ManagedSession,
  engine: string,
  operationId: string,
  requestId: string
) {
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
