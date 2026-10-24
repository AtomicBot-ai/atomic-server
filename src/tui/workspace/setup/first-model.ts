import { workspaceHeaderRows } from '../draw/brand-header.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { COLORS, text, textWidth } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import { quietButton } from '../draw/controls.js'
import { engineName, formatSize } from '../../../workspace-view/index.js'

export interface FirstModelChoice {
  key: string
  name: string
  detail: string
  group: string
  action: string
  installed: boolean
}

export function isFirstModel(s: WorkspaceState) {
  return s.firstRun === 'model' && s.setup?.stage === 'models' && !s.connection?.pickingModel
}

/** The desktop's local/recommended/Hub groups, backed by this engine's actual catalog. */
export function firstModelChoices(s: WorkspaceState): FirstModelChoice[] {
  const local: FirstModelChoice[] = s.installed.map((m, i) => ({
    key: `local:${m.id}`,
    name: m.name || m.id,
    detail: `${engineName(m.provider)} · Downloaded`,
    group: 'On this device',
    action: `first-installed:${i}`,
    installed: true,
  }))
  const available = s.setup?.path
    ? s.setup.path.rows.map((m, i) => ({
        key: m.id,
        name: m.title,
        detail: m.detail,
        action: `setup-path-repo:${i}`,
      }))
    : (s.setup?.repositories ?? []).map((m, i) => ({
        key: m.id,
        name: m.title || m.id.split('/').at(-1) || m.id,
        detail: m.summary || m.id,
        action: `setup-repo:${i}`,
      }))
  return [
    ...local,
    ...available
      .filter((m) => !s.installed.some((l) => l.id === m.key || l.id.startsWith(m.key + '/')))
      .map((m, i) => ({
        ...m,
        key: `catalog:${m.key}`,
        group: i < 3 ? 'Recommended' : 'Hugging Face',
        installed: false,
      })),
  ]
}

export function selectedFirstModel(s: WorkspaceState) {
  const rows = firstModelChoices(s)
  return rows.find((row) => row.key === s.setup?.firstChoice) ?? rows[0]
}

/** One scroll region, with group headings and radio cards, above a fixed action bar. */
export function drawFirstModel(c: Canvas, s: WorkspaceState, focus: string, seconds: number) {
  const width = Math.min(100, c.width - 8),
    x = Math.floor((c.width - width) / 2),
    v = s.setup!
  const heading = workspaceHeaderRows(c)
  text(c, x, heading, 'Choose your first model', COLORS.gold, width)
  let top = heading + (c.height < 30 ? 1 : 2)
  if (v.device && (c.height >= 30 || heading < 8)) {
    const memory = v.device.memory > 0 ? ` · ${formatSize(v.device.memory * 1024 ** 2)} memory` : ''
    text(c, x, top++, `[=] ${v.device.name}${memory}`, COLORS.muted, width)
    if (c.height >= 30) top++
  }
  const rows = firstModelChoices(s),
    chosen = selectedFirstModel(s),
    maxBar = c.height - 6,
    cardHeight = maxBar - 1 - top >= 8 ? 4 : 3,
    groupCount = rows.filter((row, i) => i === 0 || row.group !== rows[i - 1]!.group).length,
    barY = Math.min(maxBar, top + Math.max(3, rows.length * cardHeight + groupCount) + 1),
    bottom = barY - 1
  const focused = focus.startsWith('first-model-choice:') ? Number(focus.slice(19)) : s.selected
  let start = Math.max(0, Math.min(rows.length - 1, focused)),
    used = cardHeight + 1
  while (start > 0) {
    const cost = cardHeight + (rows[start - 1]!.group === rows[start]!.group ? 0 : 1)
    if (used + cost > bottom - top) break
    start--
    used += cost
  }
  let rowY = top,
    group = ''
  for (let i = start; i < rows.length; i++) {
    const model = rows[i]!
    if (group !== model.group) {
      if (rowY + cardHeight + 1 > bottom) break
      group = model.group
      text(c, x, rowY++, group, COLORS.muted, width - 2)
    }
    if (rowY + cardHeight > bottom) break
    const id = `first-model-choice:${i}`,
      selected = chosen?.key === model.key
    panel(c, x, rowY, width - 2, cardHeight, selected || focus === id, seconds)
    text(c, x + 2, rowY + 1, model.name, COLORS.text, width - 12, undefined, true)
    text(c, x + width - 8, rowY + 1, selected ? '(o)' : '( )', selected ? COLORS.gold : COLORS.muted)
    if (cardHeight > 3) text(c, x + 2, rowY + 2, model.detail, COLORS.muted, width - 6)
    c.targets.push({
      id,
      x,
      y: rowY,
      width: width - 2,
      height: cardHeight,
      hint: model.detail,
    })
    rowY += cardHeight
  }
  if (start > 0 || c.targets.filter((t) => t.id.startsWith('first-model-choice:')).length < rows.length) {
    const length = Math.max(1, bottom - top)
    for (let i = 0; i < length; i++) text(c, x + width - 1, top + i, '|', COLORS.line)
    const thumb = Math.round(((length - 1) * focused) / Math.max(1, rows.length - 1))
    text(c, x + width - 1, top + thumb, '#', COLORS.muted)
  }
  if (!rows.length) {
    text(c, x, top, v.busy ? 'Loading models…' : 'No models available.', COLORS.muted, width)
    if (!v.busy) quietButton(c, 'first-model', x, top + 2, 'Retry', 'Reload available models', focus)
  }
  if (v.error) text(c, x, bottom - 1, v.error.split('\n')[0]!, COLORS.red, width)
  text(c, x, barY, '-'.repeat(width), COLORS.line, width)
  const label = 'Continue',
    actionX = x + width - textWidth(label) - 6,
    skipX = actionX - 15
  if (chosen) {
    if (!v.busy)
      actionButton(c, 'first-model-continue', actionX, barY + 1, label, 'Use this model and continue', focus)
  }
  quietButton(c, 'first-skip', skipX, barY + 2, 'Skip setup', 'Open workspace; downloads continue', focus)
}
