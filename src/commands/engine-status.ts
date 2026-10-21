/**
 * `atc engines list` and `atc engines status [engine]`: every engine the core registers on this host,
 * and for a managed one its state as the core reports it — the plan (installable, blocked, not
 * available), the installation and its release, an operation in progress, an update on offer.
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineVersions, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../cli/index.js'
import type { ManagedEngineState } from '../contract/index.js'
import type { EngineView } from '../workspace-view/index.js'
import { blockerLines, engineView, formatSize, phaseText } from '../workspace-view/index.js'
import { workspace } from './control.js'

type Row = EngineVersions & { managed?: ManagedEngineState & { state: EngineView } }
/** A managed engine the core does not register on this platform (macOS): shown, never offered. */
type Absent = { engine: string; kind: 'managed'; available: false }

const isManaged = (engine: string) => (ENGINE_KINDS as Readonly<Record<string, string>>)[engine] === 'managed'

/** A build engine's one line: its active build and whether a newer one is offered. */
function buildSummary(e: EngineVersions): string {
  const active = e.active ? `installed (${e.active.version}/${e.active.variant})` : 'not installed'
  const target = e.update?.needed ? e.update.target : null
  return target ? `${active}; update available: ${target.version}/${target.variant}` : active
}

function detail(ctx: CommandContext, row: Row): void {
  const say = (line: string) => ctx.out.line(line)
  const m = row.managed
  say(`${row.engine} (${row.kind}): ${m ? m.state.summary : buildSummary(row)}`)
  if (!m) {
    say(`  Builds on disk: ${row.builds.length}`)
    if (row.latest) say(`  Newest for this machine: ${row.latest.version}/${row.latest.variant}`)
    return
  }
  if (m.installation)
    say(
      `  Installation: ${m.installation.status}, release ${m.installation.active_descriptor_id ?? 'none yet'}`
    )
  if (m.update?.needed && m.update.target) say(`  Update available: ${m.update.target.version}`)
  const op = m.operation
  if (op) {
    const bytes =
      op.progress?.unit === 'bytes' && op.progress.completed !== null
        ? ` — ${formatSize(op.progress.completed)} of ${formatSize(op.progress.total)}`
        : ''
    say(`  Operation ${op.operation_id}: ${op.kind}, ${phaseText(op)}${bytes}`)
  }
  if (m.other_operation)
    say(`  Waits for: the ${m.other_operation.kind} of another engine (${m.other_operation.operation_id})`)
  if (m.plan && m.plan.blockers.length) {
    say('  Blockers:')
    for (const line of blockerLines(m.plan.blockers)) say(`  ${line}`)
  }
  if (m.state.kind === 'installable') say(`  See the plan with: atc engines install ${row.engine} --dry-run`)
  if (m.state.kind === 'update') say(`  Update with: atc engines install ${row.engine}`)
}

export async function engineStatus(ctx: CommandContext, only?: string): Promise<number> {
  const service = await workspace(ctx)
  const { engines } = (await service.execute('engines.list')) as EngineVersionsResponse
  const listed = only ? engines.filter((e) => e.engine === only) : engines
  if (only && listed.length === 0) {
    ctx.out.result({ engine: only, available: false }, () =>
      ctx.out.line(`${only} is not available on this platform: the core does not offer it here.`)
    )
    return 0
  }
  const rows: Row[] = []
  for (const e of listed) {
    if (!isManaged(e.engine)) {
      rows.push(e)
      continue
    }
    const state = (await service.execute('engines.plan', { engine: e.engine })) as ManagedEngineState
    rows.push({
      ...e,
      managed: {
        ...state,
        update: state.update ?? e.update,
        state: engineView({ ...state, update: state.update ?? e.update }),
      },
    })
  }
  const absent: Absent[] = only
    ? []
    : Object.keys(ENGINE_KINDS)
        .filter((e) => isManaged(e) && !engines.some((x) => x.engine === e))
        .map((engine) => ({ engine, kind: 'managed', available: false }))
  ctx.out.result({ engines: [...rows, ...absent] }, () => {
    if (only) for (const row of rows) detail(ctx, row)
    else
      ctx.out.table(
        [{ header: 'ENGINE' }, { header: 'KIND' }, { header: 'STATE' }],
        [
          ...rows.map((r) => [r.engine, r.kind, r.managed ? r.managed.state.summary : buildSummary(r)]),
          ...absent.map((a) => [a.engine, a.kind, 'not available on this platform']),
        ]
      )
  })
  return 0
}
