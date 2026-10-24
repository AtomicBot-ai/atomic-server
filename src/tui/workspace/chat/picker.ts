import { engineName } from '../../../terminal-setup/index.js'
import { COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { COMPOSER_HEIGHT } from './composer.js'
import { fill } from '../draw/fortress.js'
import { workspaceLayout } from '../draw/layout.js'
import type { WorkspaceState } from '../state.js'
const LLAMA = ['llamacpp-upstream', 'llamacpp']
export const isPicker = (overlay: WorkspaceState['overlay']) =>
  overlay === 'engine-picker' || overlay === 'model-picker'
export interface PickerRow {
  id: string
  title: string
  detail: string
  current?: boolean
}
export function pickerRows(s: WorkspaceState): PickerRow[] {
  if (s.overlay === 'engine-picker')
    return [
      ...s.engines.map((e, i) => ({
        id: `pick-engine:${i}`,
        title: engineName(e.provider),
        detail: `${e.version} / ${e.backend} · ${e.installed ? 'Installed' : 'Install & use'}`,
        current: e.id === s.engine,
      })),
      { id: 'picker-refresh', title: 'Refresh engines', detail: 'Check compatible builds' },
    ]
  // A model under each provider that lists it; llama.cpp's two are one row, the engine choice picks.
  const rows: PickerRow[] = s.installed.flatMap((m, i) => {
    const providers = [
      ...new Set((m.providers ?? [m.provider]).map((p) => (LLAMA.includes(p) ? m.provider : p))),
    ]
    return providers.map((p) => ({
      id: providers.length > 1 ? `installed:${i}:${p}` : `installed:${i}`,
      title: m.name || m.id,
      detail: `On this device · ${engineName(p)}`,
      current: m.id === s.model && (providers.length === 1 || s.engine.split('|')[0] === p),
    }))
  })
  for (const [i, model] of s.models.entries())
    if (!s.installed.some((m) => m.id === model))
      rows.push({ id: `model:${i}`, title: model, detail: 'Connected endpoint', current: model === s.model })
  return [
    ...rows,
    { id: 'choose-engine', title: 'Inference engine', detail: 'Choose the engine used for local models' },
    { id: 'install-models', title: 'Get more models', detail: 'Browse Atomic Chat’s catalog' },
    { id: 'endpoint', title: 'Connect an endpoint', detail: 'Use another OpenAI-compatible provider' },
  ]
}
/** A local popover covers only the area above its composer, leaving the draft visible. */
export function drawPicker(c: Canvas, s: WorkspaceState, focus: string) {
  const l = workspaceLayout(c.width, c.height),
    rows = pickerRows(s)
  const anchorId = s.overlay === 'engine-picker' ? 'choose-engine' : 'choose-model'
  const anchor = c.targets.find((t) => t.id === anchorId) ?? c.targets.find((t) => t.id === 'choose-model')
  if (!anchor) return
  const width = Math.min(62, c.width - l.inset * 2)
  const x = Math.min(anchor.x - 1, c.width - l.inset - width)
  const bottom = (c.targets.find((t) => t.id === 'composer')?.y ?? l.bottom - COMPOSER_HEIGHT + 3) - 3
  const height = Math.min(22, bottom - 1, Math.max(8, rows.length * 2 + 4))
  const y = bottom - height + 1,
    count = Math.max(1, Math.floor((height - 4) / 2))
  const selected = Math.max(
    0,
    rows.findIndex((r) => r.id === s.focus)
  )
  const start = Math.max(0, Math.min(selected - count + 1, rows.length - count))
  c.popover = { x, y, width, height }
  c.targets = c.targets.filter((t) => ['choose-engine', 'choose-model'].includes(t.id))
  fill(c, x, y, width, height, COLORS.header)
  text(
    c,
    x + 2,
    y,
    s.overlay === 'engine-picker' ? 'Inference engine' : 'Choose a model',
    COLORS.text,
    width - 4,
    COLORS.header,
    true
  )
  const status =
    s.pickerError ||
    (s.pickerBusy
      ? s.message || 'Loading…'
      : s.modelsError && s.overlay === 'model-picker'
        ? s.installed.length
          ? 'Local models available · endpoint offline'
          : 'Endpoint offline · connect or get a model'
        : '')
  text(c, x + 2, y + 1, status, s.pickerError ? COLORS.red : COLORS.muted, width - 4, COLORS.header)
  rows.slice(start, start + count).forEach((row, i) => {
    const top = y + 2 + i * 2,
      active = focus === row.id
    const bg = active ? COLORS.focus : COLORS.header
    fill(c, x + 1, top, width - 2, 2, bg)
    const label = (row.current ? '✓ ' : '  ') + row.title
    text(
      c,
      x + 2,
      top,
      wrap(label, width - 5)[0] ?? '',
      active || row.current ? COLORS.gold : COLORS.text,
      width - 4,
      bg,
      true
    )
    text(c, x + 4, top + 1, row.detail, COLORS.muted, width - 6, bg)
    c.targets.push({
      id: row.id,
      x: x + 1,
      y: top,
      width: width - 2,
      height: 2,
      hint: `${row.title} | Enter Choose | Esc Close`,
    })
  })
  text(
    c,
    x + 2,
    y + height - 1,
    '↑↓ Browse | Enter Choose | Esc Close',
    COLORS.stone,
    width - 4,
    COLORS.header
  )
}
