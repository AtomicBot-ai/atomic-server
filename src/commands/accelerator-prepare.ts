/**
 * Following an accelerator prepare in the server to its end, for Foundry Local and LiteRT-LM alike: the
 * core's `<engine>:accelerators` steps as progress, the server's own state for the end (the events say a
 * step ended; only the server says the whole prepare did), then its summary.
 */

import type { CoreEventMessage } from '@atomic-chat/core/client'
import { AtcError } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import type { CoreLink } from '../core-link/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { prepareResultLines } from '../workspace-view/index.js'
import { follow, followDisplay } from './follow.js'

interface PrepareStep {
  accelerator: string
  stage: string
  fraction: number | null
  reason?: string
}
interface PrepareState {
  preparing: boolean
  last_result: { accelerators: Array<{ name: string; prepared: boolean; reason?: string }> } | null
  last_error: string | null
}
type Step<V> = { kind: 'step'; step: PrepareStep } | { kind: 'status'; view: V }

/** Start `prepare` (already requested or not) and follow it; prints its summary, throws when it failed. */
export async function followPrepare<V extends PrepareState>(
  ctx: CommandContext,
  link: CoreLink,
  service: WorkspaceClient,
  ops: { status: string; prepare: string; event: string },
  names: string[]
): Promise<number> {
  await service.execute(ops.prepare, names.length ? { accelerators: names } : {})
  const display = followDisplay<Step<V>>({ io: ctx.io, progress: ctx.progress, flags: ctx.flags }, (s) =>
    s.kind === 'step'
      ? {
          stage: `${s.step.accelerator}:${s.step.stage}`,
          text: `${s.step.accelerator}: ${s.step.stage}${s.step.reason ? ` (${s.step.reason})` : ''}`,
          done: s.step.fraction === null ? null : Math.round(s.step.fraction * 100),
          total: s.step.fraction === null ? null : 100,
        }
      : { stage: 'status', text: s.view.preparing ? 'Preparing accelerators' : 'Prepared' }
  )
  const result = await follow<Step<V>>({
    events: link.events,
    pick: (m: CoreEventMessage) =>
      m.event === ops.event ? { kind: 'step', step: m.data as PrepareStep } : undefined,
    poll: async () => ({ kind: 'status', view: (await service.execute(ops.status)) as V }),
    finished: (s) => s.kind === 'status' && !s.view.preparing,
    show: (s) => display.show(s),
    signal: ctx.signal,
    pollMs: 1000,
    alwaysPoll: true,
  })
  display.close(true)
  const last = result.value.kind === 'status' ? result.value.view : undefined
  if (last?.last_error) throw new AtcError('ATC_USAGE', `Preparing accelerators failed: ${last.last_error}`)
  ctx.out.result(last?.last_result ?? {}, () => {
    for (const line of prepareResultLines(last?.last_result ?? { accelerators: [] })) ctx.out.line(line)
  })
  return 0
}
