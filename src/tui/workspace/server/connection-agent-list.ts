import { CONNECTION_AGENTS } from '../../../contract/index.js'
import type { ConnectionDraft } from '../../../contract/index.js'
import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import type { InputResult } from '../input.js'
import { mouseReport } from '../mouse-report.js'

export function agentChoiceRows(d: ConnectionDraft, width: number, available: number) {
  const columns = width >= 66 ? 3 : available < 11 ? 2 : 1
  const height = available >= 17 ? 5 : 3
  const featured = CONNECTION_AGENTS.slice(0, 3)
  const rows: { agents: typeof featured; height: number }[] = []
  for (let i = 0; i < featured.length; i += columns)
    rows.push({ agents: featured.slice(i, i + columns), height })
  rows.push({ agents: [], height: 1 })
  if (d.more) {
    const rest = CONNECTION_AGENTS.slice(3)
    for (let i = 0; i < rest.length; i += columns)
      rows.push({ agents: rest.slice(i, i + columns), height: 3 })
  }
  return { rows, columns }
}

/** Include off-screen cards in keyboard navigation; rendering follows the focused row. */
export function agentChoiceInput(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas
): InputResult | null {
  if (s.overlay !== 'connection-guide' || s.connection?.step !== 'agent') return null
  const mouse = mouseReport(input),
    wheel = mouse && s.mouse && mouse.code & 64
  const ids = [
    ...CONNECTION_AGENTS.slice(0, 3).map((a) => `guide-select:${a.id}`),
    'guide-more',
    ...(s.connection.more ? CONNECTION_AGENTS.slice(3).map((a) => `guide-select:${a.id}`) : []),
  ]
  const at = ids.indexOf(s.focus)
  if (!wheel && at < 0) return null
  if (!(
    wheel ||
    key.tab ||
    key.upArrow ||
    key.downArrow ||
    key.leftArrow ||
    key.rightArrow ||
    key.pageUp ||
    key.pageDown ||
    key.home ||
    key.end
  ))
    return null
  if (key.tab) {
    const controls = [...ids, ...frame.targets.filter((t) => !ids.includes(t.id)).map((t) => t.id)]
    const next = (at + (key.shift ? -1 : 1) + controls.length) % controls.length
    return { patch: { focus: controls[next]!, hover: '' } }
  }
  const direction = key.upArrow || key.leftArrow || key.pageUp || (wheel && !(mouse.code & 1)) ? -1 : 1
  const delta = key.pageUp || key.pageDown ? 3 : 1
  const next = key.home
    ? 0
    : key.end
      ? ids.length - 1
      : Math.max(0, Math.min(ids.length - 1, Math.max(0, at) + direction * delta))
  return { patch: { focus: ids[next]!, hover: '' } }
}
