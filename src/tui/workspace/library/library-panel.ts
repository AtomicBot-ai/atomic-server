import { downloadRows } from '../../../workspace-view/index.js'
import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { CATEGORIES, record } from './library-model.js'
import { computeRowWindow } from '../../row-window.js'
import { bytes } from '../setup/setup-panel.js'
export function drawLibrary(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  let bx = x,
    row = y
  if (s.libraryView === 'catalog') {
    bx = x
    for (const category of CATEGORIES) {
      if (bx + category.length + 2 > x + width) {
        bx = x
        row++
      }
      bx +=
        button(
          c,
          `category:${category}`,
          bx,
          row,
          category,
          `Browse ${category} models`,
          focus,
          s.libraryCategory === category
        ) + 1
    }
    row += 2
  }
  if (s.libraryView === 'installed') {
    const items = [
      ...s.installed.map((m, i) => ({
        id: `installed:${i}`,
        name: `${s.models.includes(m.id) ? '●' : '○'} ${m.id}`,
      })),
      ...s.models
        .filter((m) => !s.installed.some((i) => i.id === m))
        .map((m) => ({ id: `model:${s.models.indexOf(m)}`, name: `● ${m}` })),
      ...(s.workspace?.setups ?? []).flatMap((v) => {
        const j = record(v),
          p = record(j['plan'])
        return j['stage'] === 'ready' && p['category']
          ? [{ id: `media-installed:${j['id']}`, name: `${p['category']} · ${p['name'] ?? p['model_id']}` }]
          : []
      }),
    ]
    const win = computeRowWindow(items.length, s.selected, Math.max(1, bottom - row - 1))
    items
      .slice(win.start, win.start + win.count)
      .forEach((v, i) =>
        button(
          c,
          v.id,
          x,
          row + i,
          v.name.slice(0, width - 2),
          'Load this model | GPU models may be unloaded',
          focus
        )
      )
    if (!items.length)
      text(c, x, row, 'No chat model installed. Browse Catalog to add one.', COLORS.muted, width)
  } else if (s.libraryView === 'downloads') {
    const items = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? [])
    const win = computeRowWindow(items.length, s.selected, Math.max(1, bottom - row - 1))
    items.slice(win.start, win.start + win.count).forEach((v, i) => {
      const d = v,
        total = d.total,
        done = d.transferred
      button(
        c,
        `download-row:${win.start + i}`,
        x,
        row + i,
        `${d.state}  ${d['model_id'] ?? record(d['plan'])['name'] ?? d['id'] ?? d['taskId'] ?? 'Transfer'} ${total ? Math.round((done / total) * 100) + '%' : ''}`.slice(
          0,
          width - 2
        ),
        'Inspect and manage this download',
        focus
      )
    })
    if (!items.length) text(c, x, row, 'No downloads.', COLORS.muted, width)
  } else {
    const win = computeRowWindow(s.libraryRows.length, s.selected, Math.max(1, bottom - row - 1))
    s.libraryRows
      .slice(win.start, win.start + win.count)
      .forEach((v, i) =>
        button(
          c,
          `library-row:${win.start + i}`,
          x,
          row + i,
          `${v.name}${s.libraryView === 'engines' ? ' · ' + v.description : ''}`.slice(0, width - 2),
          v.description || v.id,
          focus
        )
      )
    if (!s.libraryRows.length)
      text(
        c,
        x,
        row,
        s.busy ? 'Reading catalog…' : 'No entries. Refresh or change category.',
        COLORS.muted,
        width
      )
  }
  bx = x
  for (const [id, label, hint] of [
    ['library-refresh', 'Refresh', 'Refresh live list'],
    ['library-search', 'Search', 'Search model catalogs'],
    ['tools:models', 'Manage ▾', 'All engine and model controls'],
  ]) {
    bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  }
}
export function drawInstallReview(c: Canvas, s: WorkspaceState, focus: string) {
  const x = 3,
    y = 3,
    width = c.width - 6,
    height = c.height - 6
  for (let i = y; i < y + height; i++) text(c, x, i, ' '.repeat(width), COLORS.text, width, COLORS.header)
  c.targets = []
  const p = s.libraryPlan ?? {}
  text(c, x + 2, y + 1, 'Review installation', COLORS.gold)
  text(
    c,
    x + 2,
    y + 3,
    String(p['model_id'] ?? s.libraryRequest['model_id'] ?? s.libraryRequest['repo'] ?? ''),
    COLORS.text,
    width - 4
  )
  text(
    c,
    x + 2,
    y + 5,
    `Download: ${bytes(Number(p['total_download_bytes'] ?? p['total_bytes'] ?? 0))}`,
    COLORS.text,
    width - 4
  )
  const blockers = Array.isArray(p['blockers']) ? p['blockers'] : []
  text(
    c,
    x + 2,
    y + 7,
    blockers.length ? JSON.stringify(blockers) : 'Installs required engine and model files.',
    blockers.length ? COLORS.red : COLORS.muted,
    width - 4
  )
  if (!blockers.length)
    button(
      c,
      'library-install',
      x + 2,
      y + height - 3,
      'Download',
      'Start verified installation | Downloads continue in background',
      focus
    )
  button(c, 'close', x + 16, y + height - 3, 'Cancel', 'Return without downloading', focus)
}
