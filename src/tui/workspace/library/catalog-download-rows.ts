import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { text, button, COLORS } from '../draw/canvas.js'
import { computeRowWindow } from '../../row-window.js'
import { mouseReport } from '../input/mouse-report.js'
import { isVariantFormat, variantNext } from './catalog-variants.js'

export function drawCatalogDownloadRows(
  c: Canvas,
  s: WorkspaceState,
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  focus: string
) {
  const row = s.libraryRows[index]!
  const variants = s.catalogVariants.length ? s.catalogVariants : [{ value: '', label: row.name }]
  const focused = /^catalog-download-variant:\d+:(\d+)$/.exec(focus)
  const at = focused
    ? Number(focused[1])
    : Math.max(
        0,
        variants.findIndex((v) => v.value === s.catalogVariant)
      )
  const count = Math.max(1, Math.floor((height - (variants.length > height ? 1 : 0)) / 2))
  const win = computeRowWindow(variants.length, at, count)
  variants.slice(win.start, win.start + win.count).forEach((v, i) => {
    const label = isVariantFormat(row.source?.['format'])
      ? ({ engine: 'Install engine', prepare: 'Prepare accelerators', download: 'Download' }[
          variantNext(row.source, v.value).action
        ] ?? 'Download')
      : 'Download'
    const bx = x + width - label.length - 2
    text(c, x, y + i * 2, v.label, COLORS.text, Math.max(1, bx - x - 2))
    button(
      c,
      `catalog-download-variant:${index}:${win.start + i}`,
      bx,
      y + i * 2,
      label,
      v.label,
      focus,
      true
    )
  })
  if (variants.length > count)
    text(
      c,
      x,
      y + height - 1,
      `${win.start + 1}–${win.start + win.count} of ${variants.length} · ↑↓ More builds`,
      COLORS.muted,
      width
    )
}

export function catalogDownloadInput(input: string, key: Key, s: WorkspaceState, frame?: Canvas) {
  if (s.overlay || s.page !== 'models') return null
  const matched = /^catalog-download-variant:(\d+):(\d+)$/.exec(s.focus)
  if (!matched) return null
  const mouse = mouseReport(input),
    wheel = mouse && mouse.code & 64 && s.mouse
  if (wheel && frame) {
    const buttons = frame.targets.filter((t) => t.id.startsWith(`catalog-download-variant:${matched[1]}:`))
    if (
      buttons.length >= s.catalogVariants.length ||
      !buttons.some((b) => mouse.y >= b.y && mouse.y < b.y + 2)
    )
      return null
  }
  if (!wheel && !key.upArrow && !key.downArrow) return null
  const delta = wheel ? (mouse.code & 1 ? 1 : -1) : key.upArrow ? -1 : 1
  const at = Math.max(0, Math.min(Math.max(1, s.catalogVariants.length) - 1, Number(matched[2]) + delta))
  return { patch: { focus: `catalog-download-variant:${matched[1]}:${at}`, hover: '' } }
}
