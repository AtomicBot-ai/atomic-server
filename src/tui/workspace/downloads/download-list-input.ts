import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import { mouseReport } from '../input/mouse-report.js'
import { workspaceDownloadRows } from './download-layout.js'
import { downloadOwner, downloadStopped } from '../../../workspace-view/index.js'

export function downloadListInput(input: string, key: Key, s: WorkspaceState) {
  if (s.overlay !== 'download-list') return null
  const mouse = mouseReport(input)
  const wheel = mouse && mouse.code & 64 && s.mouse
  if (!wheel && !key.tab && !key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown) return null
  const rows = workspaceDownloadRows(s)
  const previous = wheel ? !(mouse.code & 1) : key.upArrow || key.pageUp || key.shift
  if (!key.tab) {
    const selected = Math.max(0, Math.min(rows.length - 1, s.selected + (previous ? -1 : 1)))
    return { patch: { selected, focus: rows.length ? `download-row:${selected}` : 'close', hover: '' } }
  }
  const controls = rows.flatMap((row, index) => {
    const owner = downloadOwner(row),
      key = `${owner}:${encodeURIComponent(row.id)}`
    return [
      { id: `download-row:${index}`, index },
      ...(owner
        ? [
            { id: `download-${downloadStopped(row.state) ? 'resume' : 'pause'}:${key}`, index },
            { id: `download-remove:${key}`, index },
          ]
        : []),
    ]
  })
  controls.push({ id: 'close', index: s.selected })
  const at = controls.findIndex((control) => control.id === s.focus)
  const target = controls[(at + (previous ? -1 : 1) + controls.length) % controls.length]!
  return { patch: { focus: target.id, selected: target.index, hover: '' } }
}
