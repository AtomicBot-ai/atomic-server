import {
  downloadRows,
  downloadOwner,
  downloadPaused,
  downloadControl,
} from '../../../workspace-view/index.js'
import { workspaceDownloadRows } from '../download-layout.js'
import type { DownloadRow } from '../../../workspace-view/index.js'
import { record } from './library-model.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { button, text, COLORS, wrap } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { bytes } from '../setup/setup-panel.js'

function selection(job: DownloadRow, s: WorkspaceState) {
  const nested = s.overlay === 'download-detail' || s.overlay === 'download-remove'
  return {
    id: job.id,
    owner: downloadOwner(job) ?? 'download',
    name: String(job['model_id'] ?? job['name'] ?? job.id),
    installed: job['completed'] === true,
    returnOverlay: nested ? (s.downloadSelection?.returnOverlay ?? null) : s.overlay,
    returnFocus: nested ? (s.downloadSelection?.returnFocus ?? s.focus) : s.focus,
  }
}
export async function downloadAction(id: string, ctx: ActionContext) {
  if (
    id === 'close' &&
    ['download-remove', 'download-detail'].includes(ctx.get().overlay ?? '') &&
    ctx.get().downloadSelection
  ) {
    ctx.update((s) => ({
      ...s,
      focus: s.downloadSelection!.returnFocus ?? s.focus,
      overlay: s.downloadSelection!.returnOverlay ?? null,
      downloadSelection: null,
      hover: '',
      message: '',
    }))
    return true
  }
  if (!id.startsWith('download-') && !id.startsWith('media-delete:')) return false
  const s = ctx.get(),
    rows = downloadRows(
      s.workspace?.setups ?? [],
      s.workspace?.downloads ?? [],
      s.page === 'models' && s.libraryView === 'downloads'
    )
  if (id === 'download-more') {
    ctx.update((v) => ({
      ...v,
      page: 'models',
      libraryView: 'downloads',
      overlay: null,
      focus: 'library-refresh',
    }))
    return true
  }
  if (id.startsWith('media-delete:')) {
    const job = (s.workspace?.setups ?? []).map(record).find((j) => j['id'] === id.slice(13))
    if (job)
      ctx.update((v) => ({
        ...v,
        overlay: 'download-remove',
        focus: 'close',
        downloadSelection: {
          id: String(job['id']),
          owner: 'artifacts',
          installed: true,
          name: String(record(job['plan'])['name'] ?? record(job['plan'])['model_id']),
          returnOverlay: s.overlay,
          returnFocus: s.focus,
        },
      }))
    return true
  }
  if (id === 'download-status' || id.startsWith('download-row:')) {
    const index = id === 'download-status' ? 0 : Number(id.slice(13)),
      job = id === 'download-status' ? workspaceDownloadRows(s)[0] : rows[index]
    if (job)
      ctx.update((v) => ({
        ...v,
        selected: index,
        downloadSelection: selection(job, s),
        overlay: 'download-detail',
        focus:
          job['kind'] === 'engine'
            ? downloadPaused(job.state)
              ? 'download-do:retry'
              : 'close'
            : downloadPaused(job.state)
              ? 'download-do:resume'
              : 'download-do:pause',
      }))
    return true
  }
  if (id === 'download-remove-confirm') {
    const chosen = s.downloadSelection
    if (!chosen || chosen.owner === 'download') return true
    await ctx.controller.runtime.execute('downloads.remove', {
      id: chosen.id,
      owner: chosen.owner,
      ...(chosen.installed ? { installed: true } : {}),
    })
    ctx.update((v) => ({
      ...v,
      ...(v.overlay === 'download-remove' && v.downloadSelection === chosen
        ? {
            overlay: chosen.returnOverlay ?? null,
            focus:
              chosen.returnOverlay === 'connection-guide' ? 'guide-model' : (chosen.returnFocus ?? v.focus),
          }
        : {}),
      downloadSelection: v.downloadSelection === chosen ? null : v.downloadSelection,
      setup: v.setup
        ? {
            ...v.setup,
            progress: null,
            selections: v.setup.selections.filter((item) => item.plan.model_id !== chosen.name),
            path: v.setup.path?.job?.id === chosen.id ? null : v.setup.path,
          }
        : null,
    }))
  } else {
    const parts = id.match(/^download-(pause|resume|remove):([^:]+):(.+)$/)
    const action = parts?.[1] ?? id.replace('download-do:', '')
    const chosen = parts ? { owner: parts[2], id: decodeURIComponent(parts[3]!) } : s.downloadSelection
    const job = rows.find(
      (row) => row.id === chosen?.id && (downloadOwner(row) ?? 'download') === chosen?.owner
    )
    if (!job) return true
    if (action === 'remove') {
      ctx.update((v) => ({
        ...v,
        downloadSelection: selection(job, s),
        overlay: 'download-remove',
        focus: 'close',
      }))
      return true
    }
    if (action === 'retry' && job['kind'] === 'engine') {
      await ctx.controller.runtime.execute('engines.retry', { id: job.id })
      const workspace = await ctx.controller.runtime.snapshot()
      ctx.update((v) => ({
        ...v,
        workspace,
        overlay: null,
        downloadSelection: null,
        focus: 'library-refresh',
      }))
      return true
    }
    if (action !== 'pause' && action !== 'resume') return false
    const command = downloadControl(job, action)
    if (!command) return true
    await ctx.controller.runtime.execute(command.operation, command.input)
    ctx.update((v) => ({
      ...v,
      hover: '',
      ...(parts && v.focus === id
        ? { focus: `download-${action === 'pause' ? 'resume' : 'pause'}:${parts[2]}:${parts[3]}` }
        : {}),
      ...(s.overlay === 'download-detail' &&
      v.overlay === s.overlay &&
      v.downloadSelection === s.downloadSelection
        ? {
            overlay: s.downloadSelection?.returnOverlay ?? null,
            focus: s.downloadSelection?.returnFocus ?? v.focus,
            downloadSelection: null,
          }
        : {}),
    }))
  }
  const workspace = await ctx.controller.runtime.snapshot()
  ctx.update((v) => ({ ...v, workspace }))
  return true
}
export function drawDownloadDetail(c: Canvas, s: WorkspaceState, focus: string) {
  const chosen = s.downloadSelection
  const job = downloadRows(
    s.workspace?.setups ?? [],
    s.workspace?.downloads ?? [],
    s.page === 'models' && s.libraryView === 'downloads'
  ).find((row) => row.id === chosen?.id && (downloadOwner(row) ?? 'download') === chosen.owner)
  if (!chosen) return
  const width = Math.min(84, c.width - 8),
    x = Math.floor((c.width - width) / 2),
    y = 4
  panel(c, x, y, width, c.height - 8)
  c.popover = { x, y, width, height: c.height - 8 }
  c.targets = []
  if (s.overlay === 'download-remove') {
    text(c, x + 2, y + 2, chosen.installed ? 'Delete model?' : 'Remove download?', COLORS.gold, width - 4)
    text(c, x + 2, y + 4, chosen.name, COLORS.text, width - 4)
    wrap(
      chosen.installed
        ? 'Downloaded files will be deleted. Shared files are kept.'
        : 'The download will stop and its partial files will be deleted. Shared files are kept.',
      width - 4
    ).forEach((line, i) => text(c, x + 2, y + 6 + i, line, COLORS.muted, width - 4))
    button(
      c,
      'download-remove-confirm',
      x + 2,
      c.height - 7,
      chosen.installed ? 'Delete model' : 'Remove download',
      'Delete this download and its files',
      focus
    )
    button(c, 'close', x + 23, c.height - 7, 'Keep it', 'Keep the download', focus)
    return
  }
  if (!job) return
  text(c, x + 2, y + 2, chosen.name, COLORS.gold, width - 4)
  text(
    c,
    x + 2,
    y + 4,
    chosen.installed
      ? 'Downloaded'
      : /cancelled|paused/.test(job.state)
        ? 'Paused'
        : job.state.replaceAll('_', ' '),
    COLORS.text,
    width - 4
  )
  text(c, x + 2, y + 6, `${bytes(job.transferred)} / ${bytes(job.total)}`, COLORS.muted, width - 4)
  if (job['error'])
    wrap(
      typeof job['error'] === 'string' ? job['error'] : String(record(job['error'])['message'] ?? ''),
      width - 4
    )
      .slice(0, 2)
      .forEach((line, i) => text(c, x + 2, y + 7 + i, line, COLORS.red, width - 4))
  if (job['kind'] === 'engine' && downloadPaused(job.state))
    button(c, 'download-do:retry', x + 2, y + 9, 'Retry download', 'Retry this engine installation', focus)
  if (downloadOwner(job)) {
    const paused = downloadPaused(job.state)
    if (!chosen.installed)
      button(
        c,
        paused ? 'download-do:resume' : 'download-do:pause',
        x + 2,
        y + 9,
        paused ? 'Resume download' : 'Pause download',
        'Partial files are retained',
        focus
      )
    button(
      c,
      'download-do:remove',
      x + 23,
      y + 9,
      chosen.installed ? 'X Delete' : 'X Remove',
      chosen.installed ? 'Delete model' : 'Remove this download',
      focus
    )
  }
}
