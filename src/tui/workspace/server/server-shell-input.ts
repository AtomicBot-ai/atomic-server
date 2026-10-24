import { moveSettings } from './settings-model.js'
import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { graphemes } from '../draw/canvas.js'
import { shellLayout } from '../shell-layout.js'
import { workspacePage } from '../navigation.js'
import { mouseReport } from '../mouse-report.js'
import type { InputResult } from '../input.js'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import { serverAgents } from './server-overview.js'
import { serverChoices } from './server-settings.js'
export function serverShellInput(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas
): InputResult | null {
  const mouse = mouseReport(input),
    l = shellLayout(frame.width, frame.height)
  if (
    s.overlay === 'server-choice' &&
    (key.upArrow || key.downArrow || key.pageDown || key.pageUp || (mouse && s.mouse && mouse.code & 64))
  ) {
    const at = Number(s.focus.replace('server-choice:', '')) || 0
    const delta = key.upArrow || key.pageUp || (mouse && !(mouse.code & 1)) ? -1 : 1
    return {
      patch: {
        focus: `server-choice:${Math.max(0, Math.min(serverChoices(s).length - 1, at + delta))}`,
        hover: '',
      },
    }
  }
  if (
    s.overlay === 'config-choice' &&
    (key.upArrow || key.downArrow || key.pageUp || key.pageDown || (mouse && s.mouse && mouse.code & 64))
  ) {
    const count = s.base.config.rows.find((r) => `setting:${r.path}` === s.edit)?.values?.length ?? 0
    const at = Number(s.focus.slice(14)) || 0,
      delta = key.upArrow || key.pageUp || (mouse && !(mouse.code & 1)) ? -1 : 1
    return { patch: { focus: `config-choice:${Math.max(0, Math.min(count - 1, at + delta))}`, hover: '' } }
  }
  if (s.overlay || s.page === 'setup' || s.page === 'welcome') return null
  if (
    s.page === 'access' &&
    (s.focus.startsWith('setting:') || s.focus.startsWith('settings-expand:')) &&
    (key.upArrow || key.downArrow || key.pageUp || key.pageDown)
  ) {
    return { patch: moveSettings(s, key.upArrow || key.pageUp ? -1 : 1) }
  }
  if (
    mouse &&
    s.mouse &&
    mouse.code & 64 &&
    l.sidebar &&
    mouse.x >= l.rail &&
    mouse.x < l.x &&
    workspacePage(s) === 'server'
  ) {
    const next = Math.max(
      0,
      Math.min(CONNECTION_AGENTS.length - 1, s.sidebarOffset + (mouse.code & 1 ? 1 : -1))
    )
    return { patch: { sidebarOffset: next, focus: `sidebar-agent:${next}`, hover: '' } }
  }
  if (s.focus.startsWith('sidebar-agent:') && (key.upArrow || key.downArrow || key.pageDown || key.pageUp)) {
    const at = Number(s.focus.slice(14)) || 0,
      delta = key.upArrow || key.pageUp ? -1 : 1
    const next = Math.max(0, Math.min(CONNECTION_AGENTS.length - 1, at + delta))
    const capacity = Math.max(
      1,
      frame.targets.filter((target) => target.id.startsWith('sidebar-agent:')).length
    )
    return {
      patch: {
        focus: `sidebar-agent:${next}`,
        sidebarOffset: Math.max(0, Math.min(next, Math.max(s.sidebarOffset, next - capacity + 1))),
        hover: '',
      },
    }
  }
  if (s.page !== 'server' || s.serverView !== 'overview') return null
  if (s.focus === 'server-search' && !mouse) {
    if (key.downArrow || key.return) return { patch: { focus: 'server-agent:0', selected: 0, hover: '' } }
    if (key.backspace || key.delete)
      return { patch: { serverQuery: graphemes(s.serverQuery).slice(0, -1).join(''), selected: 0 } }
    if (key.ctrl && input === 'u') return { patch: { serverQuery: '', selected: 0 } }
    if (input && !key.ctrl && !key.meta && !key.tab && !key.escape)
      return { patch: { serverQuery: s.serverQuery + input.replace(/\r?\n/g, ''), selected: 0 } }
  }
  const wheel = mouse && s.mouse && mouse.code & 64 && mouse.x >= l.x
  if (
    wheel ||
    (s.focus.startsWith('server-agent:') &&
      (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.pageDown || key.pageUp))
  ) {
    const columns = l.width >= 72 ? 2 : 1
    const delta = wheel
      ? mouse.code & 1
        ? 1
        : -1
      : key.upArrow || key.pageUp
        ? -columns
        : key.downArrow || key.pageDown
          ? columns
          : key.leftArrow
            ? -1
            : 1
    const current = s.focus.startsWith('server-agent:') ? Number(s.focus.slice(13)) : s.selected
    const selected = Math.max(0, Math.min(serverAgents(s).length - 1, current + delta))
    return { patch: { selected, focus: `server-agent:${selected}`, hover: '' } }
  }
  return null
}
