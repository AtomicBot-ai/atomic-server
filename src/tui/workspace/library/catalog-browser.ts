import { variantNext } from './catalog-variants.js'
import { drawCatalogDownloadRows } from './catalog-download-rows.js'
import { downloadCardHeight, drawDownloadCard } from '../setup/download-card.js'
import {
  CATALOG_FORMAT_LABELS,
  attributionOf,
  downloadRows,
  downloadOwner,
  downloadStopped,
} from '../../../workspace-view/index.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap, rule } from '../draw/canvas.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import { card } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { catalogWindow } from './catalog-window.js'
import { catalogIndexes } from './catalog-filters.js'
import { CATEGORY_NAMES } from './catalog-menu.js'
import { catalogColumns, drawCatalogColumns, drawCatalogMetadata } from './catalog-table.js'
import { modelJob, modelInstalled, catalogDeviceStatus, matchesCatalogInstallation } from './model-job.js'
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
            `Filters: ${CATALOG_FORMAT_LABELS[s.libraryFormat]}${[s.catalogFilters.engine, s.catalogFilters.downloaded, s.catalogFilters.uncensored, s.catalogFilters.liked].filter(Boolean).length ? ' *' : ''}`,
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
  const media = ['image', 'video', 'audio'].includes(s.libraryCategory),
    rowHeight = media ? 4 : 2
  const openIndex = indices.findIndex((index) => s.libraryRows[index]?.id === s.catalogOpen)
  const detailHeight =
    openIndex >= 0
      ? Math.min(
          Math.max(5, s.catalogVariants.length * 2 + 3),
          Math.max(4, bottom - start - rowHeight - (media ? 2 : 0))
        )
      : 0
  const heights = indices.map(
    (index, at) =>
      rowHeight +
      (at === openIndex ? detailHeight : 0) +
      (media &&
      (at === 0 ||
        modelInstalled(s, s.libraryRows[indices[at - 1]!]!.id) !==
          modelInstalled(s, s.libraryRows[index]!.id))
        ? 1
        : 0)
  )
  const win = catalogWindow(heights, s.selected, bottom - start)
  let rowY = start,
    lastGroup = ''
  indices.slice(win.start, win.start + win.count).forEach((index, offset) => {
    if (rowY + rowHeight > bottom) return
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
        icon: media
          ? model.category === 'video'
            ? '[>]'
            : model.category === 'audio'
              ? '[~]'
              : '[#]'
          : open
            ? 'v'
            : '>',
        detail: media
          ? `${status ? status + ' · ' : ''}${attributionOf(model) || String(model.source?.['developer'] ?? model.description ?? model.id)}`
          : model.description || model.id,
        focus,
        selected: open,
      })
    } else {
      const active = focus === rowId || open
      for (let line = 0; line < rowHeight; line++)
        text(c, x, rowY + line, ' '.repeat(width), COLORS.text, width, active ? COLORS.focus : COLORS.surface)
      text(c, x + 1, rowY, open ? 'v' : '>', active ? COLORS.accent : COLORS.muted, 1)
      text(c, x + 3, rowY, model.name, COLORS.text, catalogColumns(width)[0]!.width - 1, undefined, true)
      drawCatalogMetadata(c, model, x, rowY, width, status)
      rule(c, x, rowY + 1, width)
      if (status && !catalogColumns(width).some((column) => column.key === 'device'))
        text(c, x + 3, rowY + 1, `[${status}]`, status === 'Loaded' ? COLORS.accent : COLORS.muted, width - 7)
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
      detail = wrap(
        String(
          (model.source?.['format'] === 'fastflowlm'
            ? variantNext(model.source, s.catalogVariant).variant?.['summary']
            : '') ||
            model.description ||
            model.id
        ),
        width - 4
      )
    const job = modelJob(s, model.id)
    if (job && job['stage'] !== 'ready' && available < downloadCardHeight(c.height)) {
      const transfer = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).find(
        (row) => row.id === job['id']
      )
      const owner = transfer && downloadOwner(transfer)
      if (transfer && owner && available >= 1) {
        const key = `${owner}:${encodeURIComponent(transfer.id)}`,
          paused = downloadStopped(transfer.state)
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
        (item) =>
          (!['geniex', 'fastflowlm'].includes(String(model.source?.['engine'])) ||
            item.provider === model.source?.['engine']) &&
          (matchesCatalogInstallation(model, item, s.workspace?.setups) ||
            item.id === record(job?.['plan'])['variant_id'] ||
            item.id === record(job?.['plan'])['model_id'])
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
    const controlY = rowY + Math.min(2, detail.length) + 1
    if (s.busy) text(c, x + 2, controlY, 'Reading versions...', COLORS.muted, width - 4)
    else if (job && !ready)
      button(c, 'library:downloads', x + 2, controlY, 'View download', 'Open download controls', focus)
    else if (loaded || (ready && record(job?.['plan'])['category'])) {
      const mediaReady = ready && record(job?.['plan'])['category']
      button(
        c,
        mediaReady ? `media-installed:${job?.['id']}` : `installed:${s.installed.indexOf(loaded!)}`,
        x + 2,
        controlY,
        'Load model',
        'Load this installed model',
        focus,
        true
      )
      button(
        c,
        mediaReady
          ? `media-delete:${job?.['id']}`
          : loaded!.store === 'fastflowlm'
            ? `fastflowlm-delete:${encodeURIComponent(loaded!.id)}`
            : loaded!.store === 'geniex'
              ? `geniex-delete:${encodeURIComponent(loaded!.id)}`
              : `installed-delete:${encodeURIComponent(loaded!.id)}`,
        x + 17,
        controlY,
        'X Delete',
        'Delete downloaded model',
        focus
      )
    } else
      drawCatalogDownloadRows(
        c,
        s,
        index,
        x + 2,
        controlY,
        width - 4,
        Math.max(1, Math.min(detailHeight - (controlY - rowY), bottom - controlY)),
        focus
      )
    rowY += detailHeight
  })
  scrollTrack(c, x + width - 1, start, bottom - start, win.start, win.count, indices.length)
  if (!indices.length)
    text(c, x, start, s.busy ? 'Reading catalog...' : 'No models match your search.', COLORS.muted, width)
}
