import { downloadOwner, downloadPaused } from '../../workspace-view/index.js'
import type { WorkspaceState } from './state.js'
import type { Canvas } from './draw/canvas.js'
import { button, COLORS, text } from './draw/canvas.js'
import { panel } from './draw/cards.js'
import { floatingDownloadBounds, workspaceDownloadRows } from './download-layout.js'

/** A persistent, bordered header card; actions and content never share its rows. */
export function drawFloatingDownloads(
  c: Canvas,
  s: WorkspaceState,
  focus: string,
  highlight = false,
  boundsOverride?: { x: number; y: number; width: number; height: number }
) {
  const rows = workspaceDownloadRows(s),
    bounds = boundsOverride ?? floatingDownloadBounds(c, s),
    row = rows[0]
  if (!bounds || !row) return
  const { x, y, width, height } = bounds,
    plan = row['plan'] as Record<string, unknown> | undefined,
    name = String(plan?.['name'] ?? row['name'] ?? row['model_id'] ?? row.id),
    percent = row.total > 0 ? Math.min(100, Math.floor((row.transferred / row.total) * 100)) : null,
    paused = downloadPaused(row.state),
    owner = downloadOwner(row),
    progress = row['progress'] as Record<string, unknown> | undefined,
    speed =
      s.transferSamples[row.id]?.speed ||
      Number(row['bytes_per_second'] ?? progress?.['bytes_per_second'] ?? 0),
    reportedEta = Number(row['eta_seconds'] ?? progress?.['eta_seconds'] ?? NaN),
    eta =
      Number.isFinite(reportedEta) && reportedEta >= 0
        ? reportedEta
        : speed > 0 && row.total > 0
          ? Math.max(0, (row.total - row.transferred) / speed)
          : null,
    status = row.state.replaceAll('_', ' '),
    remaining = /paused|cancelled|failed|interrupted/.test(row.state)
      ? ''
      : eta !== null
        ? `~${eta < 60 ? Math.ceil(eta) + ' sec' : Math.ceil(eta / 60) + ' min'}`
        : 'Estimating…'
  const targetId = row['pending'] ? 'first-downloads' : 'download-status'
  panel(c, x, y, width, height, highlight || focus === targetId)
  c.targets.push({
    id: targetId,
    x,
    y,
    width,
    height,
    hint: `${name} · View download`,
  })
  const compact = height < 5,
    more = rows.length > 1 ? `[ +${rows.length - 1} more ]` : ''
  text(
    c,
    x + 2,
    y + 1,
    name,
    COLORS.text,
    width - 4 - (compact && more ? more.length + 2 : 0),
    undefined,
    true
  )
  const barWidth = compact ? 8 : Math.max(5, Math.min(18, width - 12)),
    filled = Math.round(((percent ?? 0) / 100) * barWidth)
  text(
    c,
    x + 2,
    y + 2,
    `[${'#'.repeat(filled)}${'.'.repeat(barWidth - filled)}] ${percent === null ? '…' : percent + '%'}${compact ? ` ${status}${remaining ? ' · ' + remaining : ''}` : ''}`,
    COLORS.gold,
    width - 4
  )
  if (!compact)
    text(
      c,
      x + 2,
      y + 3,
      `${status}${remaining ? ' · ' + remaining : ''}`,
      COLORS.muted,
      width - 4 - (more ? more.length + 1 : 0)
    )
  if (more)
    button(
      c,
      'download-more',
      x + width - more.length - 3,
      y + (compact ? 1 : 3),
      more,
      'View all downloads',
      focus
    )
  const inlineControls =
    (s.firstRun === 'media' && owner === 'artifacts') ||
    (s.page === 'models' && s.libraryView === 'downloads')
  if (owner && !inlineControls) {
    const key = `${owner}:${encodeURIComponent(row.id)}`
    button(
      c,
      `download-${paused ? 'resume' : 'pause'}:${key}`,
      x + width - 17,
      y,
      paused ? '> Resume' : '|| Pause',
      paused ? 'Resume download' : 'Pause download',
      focus
    )
    button(c, `download-remove:${key}`, x + width - 6, y, 'X', 'Remove download', focus)
  }
}
