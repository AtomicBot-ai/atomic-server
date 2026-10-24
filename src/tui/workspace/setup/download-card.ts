import { downloadRows, downloadOwner, downloadPaused } from '../../../workspace-view/index.js'
import type { WorkspaceState } from '../state.js'
import { COLORS, text, button } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { record } from '../library/library-model.js'
export const downloadCardHeight = (rows: number) => (rows < 30 ? 4 : 5)
export function drawDownloadCard(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  index = 0,
  focus = '',
  includeCompleted = false
) {
  const rows = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? [], includeCompleted)
  const first = rows[index],
    progress = s.setup?.progress
  const selection = s.setup?.selections[index]
  const path = s.setup?.path
  const preparing = s.setup?.preparing ? s.setup.pending?.repo || s.setup.repository : ''
  if (!first && !selection && !path?.job && !preparing) return false
  const plan = record(first?.['plan'])
  const name = String(
    plan['name'] ??
      first?.['model_id'] ??
      selection?.plan.model_id ??
      path?.job?.model ??
      (preparing || first?.id) ??
      'Model'
  )
  const done = first?.transferred ?? progress?.transfers.reduce((n, t) => n + t.transferred, 0) ?? 0
  const total =
    first?.total ??
    selection?.plan.total_download_bytes ??
    (path?.plan && 'download_bytes' in path.plan ? path.plan.download_bytes : 0)
  const ready = first?.['completed'] === true || (progress?.ready && !first)
  const percent = ready ? 100 : total ? Math.min(100, Math.floor((done / total) * 100)) : 0
  const state =
    preparing && s.setup?.error
      ? 'Failed'
      : ready
        ? 'Downloaded'
        : first && /paused|cancelled/.test(first.state)
          ? 'Paused'
          : String(first?.state ?? progress?.jobs[0]?.stage ?? 'Preparing').replaceAll('_', ' ')
  const speed = first ? (s.transferSamples[first.id]?.speed ?? 0) : (progress?.speed ?? 0)
  const eta = speed > 0 ? Math.max(0, (total - done) / speed) : !first ? progress?.eta : null
  let remaining =
    ready || /failed|interrupted|paused|cancelled/i.test(state)
      ? ''
      : eta && eta > 0
        ? `~${eta < 60 ? Math.ceil(eta) + ' sec' : Math.ceil(eta / 60) + ' min'} left`
        : 'Estimating time'
  const height = downloadCardHeight(c.height)
  panel(c, x, y, width, height, focus === `download-row:${index}`)
  if (first)
    c.targets.push({
      id: `download-row:${index}`,
      x,
      y,
      width,
      height,
      hint: `${name} · View download`,
    })
  else if (preparing)
    c.targets.push({
      id: 'first-downloads',
      x,
      y,
      width,
      height,
      hint: s.setup?.error || `${name} · Preparing download`,
    })
  const owner = first ? downloadOwner(first) : null
  text(c, x + 2, y + 1, name, COLORS.text, width - (owner ? 19 : 4), undefined, true)
  if (first && owner) {
    const paused = downloadPaused(first.state),
      key = `${owner}:${encodeURIComponent(first.id)}`
    if (!ready)
      button(
        c,
        `download-${paused ? 'resume' : 'pause'}:${key}`,
        x + width - 16,
        y + 1,
        paused ? '> Resume' : '|| Pause',
        paused ? 'Resume this download' : 'Pause; keep partial files',
        focus
      )
    button(
      c,
      `download-remove:${key}`,
      x + width - (ready ? 10 : 5),
      y + 1,
      ready ? 'X Delete' : 'X',
      ready ? 'Delete model' : 'Remove this download',
      focus
    )
  }
  const bar = Math.max(5, Math.min(height === 4 ? 8 : 24, width - 15)),
    filled = Math.round((percent / 100) * bar)
  text(
    c,
    x + 2,
    y + 2,
    '[' + '#'.repeat(filled) + '.'.repeat(bar - filled) + `] ${percent}%`,
    COLORS.gold,
    width - 4
  )
  const statusX = height === 4 ? x + bar + 11 : x + 2
  const statusWidth = x + width - statusX - 2
  const compact = height === 4
  let label = compact
    ? /download|transfer/i.test(state)
      ? 'Downloading'
      : /prepar|install|planning/i.test(state)
        ? 'Preparing'
        : state.charAt(0).toUpperCase() + state.slice(1)
    : state
  if (compact) {
    if (remaining === 'Estimating time') remaining = 'Estimating'
    if (`${label} · ${remaining}`.length > statusWidth) remaining = remaining.replace(' left', '')
    if (`${label} · ${remaining}`.length > statusWidth)
      remaining =
        eta && eta > 0
          ? `~${eta < 60 ? Math.ceil(eta) + 's' : Math.ceil(eta / 60) + 'm'}`
          : remaining
            ? 'ETA…'
            : ''
    if (remaining) label = label.slice(0, Math.max(1, statusWidth - remaining.length - 3))
  }
  text(
    c,
    statusX,
    y + (height === 4 ? 2 : 3),
    `${label}${remaining ? ' · ' + remaining : ''}${index === 0 && rows.length > 1 ? ` · ${rows.length - 1} more` : ''}`,
    COLORS.muted,
    statusWidth
  )
  return true
}
