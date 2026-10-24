import type { ActionContext } from '../actions.js'
import { modelJob } from '../library/model-job.js'
import { downloadAction } from '../library/download-detail.js'
import { libraryRows } from '../library/library-model.js'
import { libraryAction } from '../library/library-actions.js'
import type { Canvas } from '../draw/canvas.js'
import { button, text, COLORS } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { computeRowWindow } from '../../row-window.js'
import { formatSize, downloadRows, downloadPaused } from '../../../workspace-view/index.js'
const CATEGORIES = ['image', 'video'] as const
export async function loadSetupMedia(ctx: ActionContext) {
  const request = ctx.get().setupMedia.request + 1
  ctx.update((s) => ({
    ...s,
    setupMedia: { ...s.setupMedia, request, loading: true },
    selected: 0,
    focus: 'media-queue:0',
    message: '',
  }))
  const groups = await Promise.allSettled(
    CATEGORIES.map(async (category) => {
      const result = await ctx.controller.runtime.execute('models.catalog', { category })
      return libraryRows(result, 'catalog').map((row) => ({ ...row, category }))
    })
  )
  ctx.update((s) => {
    if (s.setupMedia.request !== request) return s
    if (s.firstRun !== 'media' || s.page !== 'welcome')
      return { ...s, setupMedia: { ...s.setupMedia, loading: false } }
    const errors: Record<string, string> = {}
    const rows = groups.flatMap((group, i) => {
      if (group.status === 'fulfilled') return group.value
      errors[CATEGORIES[i]!] = group.reason instanceof Error ? group.reason.message : String(group.reason)
      return s.libraryRows.filter((row) => row.category === CATEGORIES[i])
    })
    const selected = (category: 'image' | 'video') =>
      rows.find((row) => row.category === category && row.id === s.setupMedia[category])?.id ??
      rows.find((row) => row.category === category)?.id ??
      ''
    return {
      ...s,
      libraryRows: rows,
      libraryCategory: 'image',
      libraryView: 'catalog',
      setupMedia: { image: selected('image'), video: selected('video'), errors, request, loading: false },
    }
  })
}
export async function mediaSetupAction(id: string, ctx: ActionContext) {
  if (id === 'media-refresh') {
    await loadSetupMedia(ctx)
    return true
  }
  if (id.startsWith('media-queue:')) {
    const s = ctx.get(),
      category = CATEGORIES[Number(id.slice(12))]
    const index = s.libraryRows.findIndex(
      (row) => row.category === category && row.id === s.setupMedia[category]
    )
    if (index < 0) return true
    await mediaSetupAction(`media-row:${index}`, ctx)
    ctx.update((v) => ({ ...v, focus: v.overlay ? v.focus : id }))
    return true
  }
  if (!id.startsWith('media-row:')) return false
  const index = Number(id.slice(10)),
    row = ctx.get().libraryRows[index]
  if (!row || ctx.get().busy || ctx.get().setupMedia.loading) return true
  const existing = modelJob(ctx.get(), row.id)
  if (existing) {
    await downloadAction(
      existing['stage'] === 'ready'
        ? `media-delete:${existing['id']}`
        : `download-remove:artifacts:${encodeURIComponent(String(existing['id']))}`,
      ctx
    )
    ctx.update((s) => ({
      ...s,
      selected: CATEGORIES.indexOf(row.category as 'image' | 'video'),
      downloadSelection: s.downloadSelection
        ? {
            ...s.downloadSelection,
            returnFocus: `media-queue:${CATEGORIES.indexOf(row.category as 'image' | 'video')}`,
          }
        : null,
    }))
    return true
  }
  ctx.update((s) => ({ ...s, libraryCategory: row.category, libraryView: 'catalog' }))
  await libraryAction(`library-row:${index}`, ctx)
  ctx.update((s) => ({ ...s, page: 'welcome', focus: id }))
  return true
}
export function drawSetupMedia(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number
) {
  const wide = width >= 76,
    available = bottom - y
  const height = Math.min(8, Math.max(4, wide ? available : Math.floor(available / 2)))
  const count = wide ? 2 : Math.max(1, Math.min(2, Math.floor(available / height)))
  const focused = /^media-queue:([01])$/.exec(focus)
  const selected = focused ? Number(focused[1]) : Math.min(1, s.selected)
  const win = computeRowWindow(2, selected, count),
    cardWidth = wide ? Math.floor((width - 2) / 2) : width
  CATEGORIES.slice(win.start, win.start + win.count).forEach((category, offset) => {
    const index = win.start + offset,
      cardX = x + (wide ? offset * (cardWidth + 2) : 0)
    const cardY = y + (wide ? 0 : offset * height)
    const model =
      s.libraryRows.find((row) => row.category === category && row.id === s.setupMedia[category]) ??
      s.libraryRows.find((row) => row.category === category)
    const job = model ? modelJob(s, model.id) : undefined,
      error = s.setupMedia.errors[category]
    panel(c, cardX, cardY, cardWidth, height, selected === index, seconds)
    const art =
      category === 'video'
        ? ['[ >  ]', '[ >> ]', '[ >>>]'][Math.floor(seconds * 2) % 3]!
        : [String.raw` /\_/\ `, String.raw` /\^/\ `][Math.floor(seconds * 2) % 2]!
    text(
      c,
      cardX + 2,
      cardY + (height === 4 ? 0 : 1),
      `${art} ${category === 'image' ? 'Image generation' : 'Video generation'}`,
      COLORS.text,
      cardWidth - 4
    )
    if (model) {
      text(
        c,
        cardX + 2,
        cardY + (height === 4 ? 1 : 2),
        model.name,
        COLORS.text,
        cardWidth - 4,
        undefined,
        true
      )
      if (height >= 7) text(c, cardX + 2, cardY + 3, model.description, COLORS.muted, cardWidth - 4)
      const size = Number(
        model.source?.['download_bytes'] ?? model.source?.['total_bytes'] ?? model.source?.['size']
      )
      if (height >= 8 && size > 0)
        text(c, cardX + 2, cardY + 4, `${formatSize(size)} download`, COLORS.muted, cardWidth - 4)
      const transfer =
        job &&
        downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? [], true).find(
          (row) => row.id === job['id']
        )
      const active = transfer && transfer['completed'] !== true
      if (transfer && height >= 7) {
        const percent = transfer['completed']
          ? 100
          : transfer.total
            ? Math.min(100, Math.floor((transfer.transferred / transfer.total) * 100))
            : 0
        const filled = Math.round((percent / 100) * 12)
        text(
          c,
          cardX + 2,
          cardY + 4,
          '[' + '#'.repeat(filled) + '.'.repeat(12 - filled) + `] ${percent}%`,
          COLORS.gold,
          cardWidth - 4
        )
      }
      if (transfer && height >= 8) {
        const speed = s.transferSamples[transfer.id]?.speed ?? 0
        const eta = speed > 0 ? Math.ceil(Math.max(0, transfer.total - transfer.transferred) / speed) : 0
        const status = transfer['completed'] ? 'Downloaded' : transfer.state.replaceAll('_', ' ')
        const remaining =
          active && !downloadPaused(transfer.state)
            ? eta
              ? ` · ~${eta < 60 ? eta + ' sec' : Math.ceil(eta / 60) + ' min'} left`
              : ' · Estimating time'
            : ''
        text(c, cardX + 2, cardY + 5, status + remaining, COLORS.muted, cardWidth - 4)
      }
      if (active) {
        const paused = downloadPaused(transfer.state)
        button(
          c,
          `download-${paused ? 'resume' : 'pause'}:artifacts:${encodeURIComponent(transfer.id)}`,
          cardX + cardWidth - 13,
          cardY + height - 2,
          paused ? '> Resume' : '|| Pause',
          paused ? 'Resume model download' : 'Pause model download',
          focus
        )
      }
      button(
        c,
        `media-queue:${index}`,
        cardX + 2,
        cardY + height - 2,
        job ? (transfer?.['completed'] ? 'X Delete' : 'X Remove') : '+ Add to queue',
        job ? 'Remove this model from the queue' : 'Download the selected model',
        focus
      )
    } else
      text(
        c,
        cardX + 2,
        cardY + (height === 4 ? 1 : 2),
        s.setupMedia.loading ? 'Loading models...' : error ? 'Could not load models' : 'No models available',
        COLORS.muted,
        cardWidth - 4
      )
    if (error && !s.setupMedia.loading)
      button(c, 'media-refresh', cardX + cardWidth - 9, cardY + height - 2, 'Retry', error, focus)
  })
}
