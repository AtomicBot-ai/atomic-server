import { foundryNext } from './catalog-foundry.js'
import { downloadCardHeight, drawDownloadCard } from '../setup/download-card.js'
import { downloadRows, downloadOwner, downloadPaused } from '../../../workspace-view/index.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap, rule } from '../draw/canvas.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import { card, actionButton } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { computeRowWindow } from '../../row-window.js'
import { catalogIndexes } from './catalog-filters.js'
import { CATEGORY_NAMES } from './catalog-menu.js'
import { catalogColumns, drawCatalogColumns, drawCatalogMetadata } from './catalog-table.js'
import { modelJob, modelInstalled, catalogDeviceStatus } from './model-job.js'
import { record } from './library-model.js'

export function drawCatalogBrowser(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const compact = bottom - y < 12
  let bx = x,
    toolbarY = y
  const controls = [
    ['catalog-category', `${CATEGORY_NAMES[s.libraryCategory] ?? s.libraryCategory} v`, 'Choose model type'],
    [
      'library-search',
      s.libraryQuery ? `Search: ${s.libraryQuery.slice(0, 14)}` : 'Search models',
      'Search model catalog',
    ],
    ...(s.libraryCategory === 'text'
      ? [
          [
            'library-filters',
            `Filters${[s.catalogFilters.engine, s.catalogFilters.downloaded, s.catalogFilters.uncensored, s.catalogFilters.liked].filter(Boolean).length ? ' *' : ''}`,
            'Engine, format and model filters',
          ],
          ['catalog-sort', 'Sort v', 'Sort models'],
        ]
      : []),
    ['catalog-import', '+ Import', 'Import a local GGUF file'],
  ]
  for (const [id, label, hint] of controls) {
    const short = compact
      ? ({
          'catalog-category': 'Type',
          'library-search': 'Search',
          'library-filters': 'Filters',
          'catalog-sort': 'Sort',
          'catalog-import': '+',
        }[id!] ?? label!)
      : label!
    const field = !compact && ['catalog-category', 'library-search', 'catalog-sort'].includes(id!)
    const controlWidth = field ? short.length + 5 : short.length + 2
    if (bx + controlWidth > x + width) {
      bx = x
      toolbarY += compact ? 1 : 2
    }
    if (field) {
      fieldControl(
        c,
        id!,
        bx,
        toolbarY,
        controlWidth,
        label!.replace(/ v$/, ''),
        hint!,
        focus,
        id !== 'library-search'
      )
      bx += controlWidth + 1
    } else bx += button(c, id!, bx, toolbarY, short, hint!, focus) + 1
  }
  if (s.libraryCategory === 'text' && !compact) {
    drawCatalogColumns(c, x, toolbarY + 2, width, focus, s.catalogFilters.sort)
    rule(c, x, toolbarY + 3, width)
  }
  const start = toolbarY + (s.libraryCategory === 'text' && !compact ? 4 : 2),
    indices = catalogIndexes(s)
  const media = ['image', 'video'].includes(s.libraryCategory),
    rowHeight = media ? 4 : 2
  const openIndex = indices.findIndex((index) => s.libraryRows[index]?.id === s.catalogOpen)
  const detailHeight =
    openIndex >= 0 ? Math.min(7, Math.max(4, bottom - start - rowHeight - (media ? 2 : 0))) : 0
  const count = Math.max(1, Math.floor((bottom - start - detailHeight - (media ? 2 : 0)) / rowHeight))
  const win = computeRowWindow(indices.length, s.selected, count)
  let rowY = start,
    lastGroup = ''
  indices.slice(win.start, win.start + win.count).forEach((index, offset) => {
    const model = s.libraryRows[index]!,
      open = model.id === s.catalogOpen,
      status = catalogDeviceStatus(s, model)
    if (media) {
      const group = modelInstalled(s, model.id) ? 'Installed' : 'Available'
      if (group !== lastGroup) {
        text(c, x + 1, rowY++, group, COLORS.muted, width - 2)
        lastGroup = group
      }
    }
    const rowId = `catalog-row:${win.start + offset}`
    const contentY = rowY + (media ? 1 : 0)
    if (media) {
      card(c, {
        id: `catalog-row:${win.start + offset}`,
        x,
        y: rowY,
        width,
        height: rowHeight,
        title: model.name.slice(
          0,
          s.libraryCategory === 'text' ? catalogColumns(width)[0]!.width - 3 : width - 15
        ),
        icon: media ? (model.category === 'video' ? '[>]' : '[#]') : open ? 'v' : '>',
        detail: media
          ? `${status ? status + ' · ' : ''}${String(model.source?.['developer'] ?? model.description ?? model.id)}`
          : model.description || model.id,
        focus,
        selected: open,
      })
    } else {
      const active = focus === rowId || open
      for (let line = 0; line < rowHeight; line++)
        text(c, x, rowY + line, ' '.repeat(width), COLORS.text, width, active ? COLORS.focus : COLORS.surface)
      text(c, x + 1, rowY, open ? 'v' : '>', active ? COLORS.gold : COLORS.muted, 1)
      text(c, x + 3, rowY, model.name, COLORS.text, catalogColumns(width)[0]!.width - 1, undefined, true)
      drawCatalogMetadata(c, model, x, rowY, width, status)
      rule(c, x, rowY + 1, width)
      if (status && !catalogColumns(width).some((column) => column.key === 'device'))
        text(c, x + 3, rowY + 1, `[${status}]`, status === 'Loaded' ? COLORS.gold : COLORS.muted, width - 7)
      c.targets.push({ id: rowId, x, y: rowY, width, height: rowHeight, hint: model.description || model.id })
    }
    button(
      c,
      `catalog-like:${index}`,
      x + width - 5,
      contentY,
      s.catalogLikes.includes(model.id) ? '*' : '+',
      'Like this model',
      focus
    )
    rowY += rowHeight
    if (!open) return
    const available = bottom - rowY,
      detail = wrap(model.description || model.id, width - 4)
    const job = modelJob(s, model.id)
    if (job && job['stage'] !== 'ready' && available < downloadCardHeight(c.height)) {
      const transfer = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).find(
        (row) => row.id === job['id']
      )
      const owner = transfer && downloadOwner(transfer)
      if (transfer && owner && available >= 1) {
        const key = `${owner}:${encodeURIComponent(transfer.id)}`,
          paused = downloadPaused(transfer.state)
        button(
          c,
          `download-${paused ? 'resume' : 'pause'}:${key}`,
          x + 2,
          rowY,
          paused ? '> Resume' : '|| Pause',
          paused ? 'Resume download' : 'Pause download',
          focus
        )
        button(c, `download-remove:${key}`, x + 16, rowY, 'X Remove', 'Remove download', focus)
      }
      return
    }
    if (available < 4) return
    detail
      .slice(0, Math.min(2, available - 4))
      .forEach((line, i) => text(c, x + 2, rowY + i, line, COLORS.muted, width - 4))
    const ready = job?.['stage'] === 'ready',
      loaded = s.installed.find(
        (item) => item.id === model.id || item.id === record(job?.['plan'])['model_id']
      )
    if (job && !ready && available >= downloadCardHeight(c.height)) {
      const downloadIndex = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).findIndex(
        (download) => download.id === job['id']
      )
      if (downloadIndex >= 0) {
        drawDownloadCard(c, s, x + 1, rowY + 1, width - 2, downloadIndex, focus)
        rowY += detailHeight
        return
      }
    }
    const controlY = rowY + Math.max(1, detailHeight - 4)
    if (s.catalogVariants.length)
      button(
        c,
        'catalog-variants',
        x + 2,
        controlY,
        `${s.catalogVariant.slice(0, Math.max(12, width - 23))} v`,
        'Choose a download version',
        focus
      )
    else if (s.busy) text(c, x + 2, controlY, 'Reading versions...', COLORS.muted, width - 4)
    if (job && !ready)
      button(c, 'library:downloads', x + 2, controlY + 2, 'View download', 'Open download controls', focus)
    else if (ready && record(job?.['plan'])['category'])
      actionButton(
        c,
        `media-installed:${job?.['id']}`,
        x + 2,
        controlY + 1,
        'Load model',
        'Load this installed model',
        focus
      )
    else if (loaded)
      actionButton(
        c,
        `installed:${s.installed.indexOf(loaded)}`,
        x + 2,
        controlY + 1,
        'Load model',
        'Load this installed model',
        focus
      )
    else
      actionButton(
        c,
        `catalog-download:${index}`,
        x + 2,
        controlY + 1,
        model.source?.['format'] === 'foundry'
          ? ({ engine: 'Install engine', prepare: 'Prepare accelerators', download: 'Download' }[
              foundryNext(model.source, s.catalogVariant).action
            ] ?? 'Download')
          : 'Download',
        'Prepare required components or download this version',
        focus
      )
    const remove =
      ready && record(job?.['plan'])['category']
        ? `media-delete:${job?.['id']}`
        : loaded
          ? `installed-delete:${encodeURIComponent(loaded.id)}`
          : ''
    if (remove) button(c, remove, x + 20, controlY + 2, 'X Delete', 'Delete downloaded model', focus)
    rowY += detailHeight
  })
  if (openIndex < 0)
    scrollTrack(c, x + width - 1, start, count * rowHeight, win.start, win.count, indices.length)
  if (!indices.length)
    text(c, x, start, s.busy ? 'Reading catalog...' : 'No models match your search.', COLORS.muted, width)
}
