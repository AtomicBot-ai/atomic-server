import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { formatSize } from '../../../workspace-view/index.js'
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
export function hardwareRows(result: string): Array<{ title: string; lines: string[] }> {
  let response: Record<string, unknown>
  try {
    response = object(JSON.parse(result))
  } catch {
    return []
  }
  const info = object(response['info']),
    cpu = object(info['cpu'])
  if (!Object.keys(info).length) return []
  const gpus = Array.isArray(info['gpus']) ? info['gpus'].map(object) : []
  return [
    {
      title: 'System',
      lines: [
        String(info['os_name'] ?? info['os_type'] ?? 'Unknown operating system'),
        ...(typeof info['total_memory'] === 'number' ? [`${formatSize(info['total_memory'])} memory`] : []),
      ],
    },
    {
      title: 'Processor',
      lines: [
        String(cpu['name'] ?? 'Unknown processor'),
        [cpu['core_count'] ? `${cpu['core_count']} cores` : '', cpu['arch']].filter(Boolean).join(' · '),
      ],
    },
    {
      title: 'Graphics',
      lines: gpus.length
        ? gpus.map((gpu) => String(gpu['name'] ?? gpu['gpu_id'] ?? 'Graphics device'))
        : ['No GPU reported'],
    },
  ]
}
export function drawHardware(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  text(c, x, y, 'Hardware', COLORS.text, width, undefined, true)
  const cards = hardwareRows(s.operationResult)
  cards.forEach((item, i) => {
    const top = y + 2 + i * 4
    panel(c, x, top, width, 4)
    text(c, x + 2, top + 1, item.title, COLORS.text, width - 4, undefined, true)
    text(c, x + 2, top + 2, item.lines.join(' · '), COLORS.muted, width - 4)
  })
  if (!cards.length)
    text(c, x, y + 2, s.busy ? 'Reading hardware…' : 'Hardware details unavailable.', COLORS.muted, width)
  if (!s.busy)
    button(c, 'settings-hardware-refresh', x, bottom, 'Refresh', 'Read hardware facts from the engine', focus)
}
