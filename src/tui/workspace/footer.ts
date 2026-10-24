import { text, textWidth, COLORS } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { escapeAction } from './escape-action.js'
/** Contextual commands have one location and share their keyboard action. */
export function drawFooter(c: Canvas, s: WorkspaceState, focus: string) {
  const back = escapeAction(s)
  const duplicate = c.targets.filter((t) => t.id === back.id && t.height === 1)
  for (const t of duplicate) {
    const surface = c.cells[t.y]?.[Math.max(0, t.x - 1)]?.background ?? COLORS.ground
    text(c, t.x, t.y, ' '.repeat(t.width), COLORS.text, t.width, surface)
  }
  c.targets = c.targets.filter((t) => !duplicate.includes(t))
  const browsing =
    /^(?:server-agent:|sidebar-agent:|server-choice:|setting:|config-choice:|media-model:|media-queue:|media-select:|guide-select:|connection-option:)/.test(
      focus
    )
  const rows =
    s.finalSetup && !s.overlay
      ? [
          ['', '↑↓←→ Move'],
          ['', 'Enter Open'],
          ['', 'F Flag'],
          ['wait-back', 'Esc Back'],
          ['quit', '^Q Quit'],
        ]
      : s.overlay === 'waiting-game'
        ? [
            ['', c.width < 76 ? '< > Move' : '< > / A D Move'],
            ['', 'Space Fire'],
            ['waiting-game-toggle', s.waitingGame?.paused ? 'P Play' : 'P Pause'],
            ['waiting-game-reset', 'R Reset'],
            ['waiting-game-close', 'Esc Back'],
          ]
        : [
            ['', browsing ? '↑↓ Browse' : 'Tab Move'],
            ['', c.width < 76 ? 'Enter' : 'Enter Select'],
            ...(back.id ? [[back.id, `Esc ${back.label}`]] : []),
            ...(c.width >= 76 ? [['help', 'Ctrl+K Help']] : []),
            ['quit', c.width < 76 ? '^Q Quit' : 'Ctrl+Q Quit'],
          ]
  let x = Math.max(1, Math.floor((c.width - rows.reduce((n, r) => n + textWidth(r[1]!) + 3, -3)) / 2))
  for (const [id, label] of rows) {
    const width = textWidth(label!)
    if (x + width > c.width) break
    text(
      c,
      x,
      c.height - 1,
      label!,
      focus === id && id ? COLORS.gold : COLORS.muted,
      width,
      focus === id && id ? COLORS.focus : undefined
    )
    if (id) c.targets.push({ id, x, y: c.height - 1, width, height: 1, hint: label! })
    x += width + 3
  }
}
