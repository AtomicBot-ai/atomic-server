import { fill, drawWelcome, eyeArtwork } from './fortress.js'
import { drawSetup } from './setup-panel.js'
import { drawDataPanel } from './data-panels.js'
import { gateRows } from './art.js'
import type { OrnamentStyle } from './art.js'
import { button, canvas, COLORS, text, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
import { workspaceLayout } from './layout.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { drawPanels } from './panels.js'
import { drawOverlay } from './overlay.js'
import { tooltip } from './tooltip.js'
import { COMPOSER_HEIGHT, drawComposer } from './composer.js'
import { newChatButton } from './chat-navigation.js'
import { drawPicker, isPicker } from './picker.js'
export function workspaceFrame(
  s: WorkspaceState,
  width: number,
  height: number,
  seconds: number,
  ornament: OrnamentStyle = 'fangs'
): Canvas {
  const c = canvas(width, height),
    l = workspaceLayout(width, height)
  const focus = s.hover || s.focus
  if (width < 54 || height < 24) {
    text(c, 1, 1, 'ATOMIC CHAT', COLORS.gold, width - 2, undefined, true)
    wrap('Expand to at least 54 columns and 24 rows. Ctrl+Q closes the console.', width - 2).forEach((r, i) =>
      text(c, 1, 3 + i, r)
    )
    return c
  }
  gateRows(width, l.gate, ornament).forEach((r, y) =>
    text(c, 0, y, r, y === l.gate - 1 ? COLORS.muted : COLORS.stone)
  )
  text(c, l.inset, l.gate + 1, '<|>', COLORS.red)
  text(c, l.inset + 5, l.gate + 1, 'ATOMIC CHAT', COLORS.text, width - l.inset - 5, undefined, true)
  let nx = l.inset
  if (s.page !== 'welcome') {
    fill(c, 0, l.gate + 3, width, 3, COLORS.header)
  }
  fill(c, 0, l.gate + 2, width, 1, COLORS.ground)
  if (s.page === 'setup')
    text(
      c,
      l.inset,
      l.gate + 4,
      'PREPARE YOUR WORKSPACE',
      COLORS.gold,
      width - l.inset * 2,
      COLORS.header,
      true
    )
  if (s.page !== 'welcome' && s.page !== 'setup')
    PAGES.forEach((p) => {
      nx +=
        button(
          c,
          `page:${p.id}`,
          nx,
          l.gate + 4,
          p.name,
          p.hint,
          focus,
          s.page === p.id || (p.id === 'server' && ['requests', 'access'].includes(s.page)),
          true
        ) + 2
    })
  let x = l.inset + l.sidebar,
    y = l.top + 2,
    bodyWidth = width - x - l.inset
  if (s.page === 'chat' && l.sidebar) {
    newChatButton(c, l.inset, y + 1, l.sidebar - 3, true, focus)
    text(c, l.inset, y + 5, 'Recents', COLORS.muted)
    s.history
      .slice(0, Math.max(0, l.bottom - y - 8))
      .forEach((h, i) =>
        button(
          c,
          `history:${h.id}`,
          l.inset,
          y + 7 + i,
          h.title.slice(0, l.sidebar - 5),
          'Resume this conversation.',
          focus,
          h.id === s.conversation?.id
        )
      )
  } else {
    x = l.inset
    bodyWidth = width - x - l.inset
  }
  if (s.page === 'welcome') {
    drawWelcome(c, focus, seconds, s.motion, l.gate + 3, l.bottom)
  } else if (s.page === 'setup' || (s.page === 'models' && s.setup)) {
    drawSetup(c, s, x, y, bodyWidth, l.bottom, focus, seconds)
  } else if (drawDataPanel(c, s, x, y, bodyWidth, l.bottom, focus)) {
    // History and key management share the same responsive content bounds.
  } else if (s.page === 'chat') {
    if (!l.sidebar) {
      newChatButton(c, x, y, 16, false, focus)
      y += 2
    }
    const composerY = l.bottom - COMPOSER_HEIGHT + 1
    if (!s.messages.length) {
      const eye = eyeArtwork(c, x, y, bodyWidth, Math.max(3, composerY - y - 2), seconds, s.motion)
      const line = s.model ? 'What would you like to explore?' : 'Your next idea starts here.'
      text(
        c,
        x + Math.max(0, Math.floor((bodyWidth - line.length) / 2)),
        Math.min(composerY - 1, eye.y + eye.height + 1),
        line,
        COLORS.muted
      )
    } else {
      const rows = s.messages.flatMap((m) => [
        m.role === 'user' ? 'YOU' : 'ATOMIC',
        ...wrap(m.content || (s.generating ? 'Thinking...' : 'No text returned.'), bodyWidth - 2),
        '',
      ])
      const available = Math.max(1, composerY - y - 1),
        end = Math.max(available, rows.length - s.scroll)
      rows
        .slice(Math.max(0, end - available), end)
        .forEach((r, i) =>
          text(
            c,
            x,
            y + i,
            r,
            r === 'YOU' ? COLORS.gold : r === 'ATOMIC' ? COLORS.red : COLORS.text,
            bodyWidth
          )
        )
    }
    drawComposer(c, s, x, composerY, bodyWidth, focus)
  } else drawPanels(c, s, { x, y, width: bodyWidth, bottom: l.bottom }, focus)
  if (isPicker(s.overlay)) drawPicker(c, s, focus)
  else if (s.overlay) drawOverlay(c, s, focus)
  const active = c.targets.find((t) => t.id === focus)
  if (!s.overlay && (s.message || s.base.busy))
    text(
      c,
      l.inset,
      height - 2,
      s.message || s.base.busy!,
      s.message ? COLORS.gold : COLORS.muted,
      width - l.inset * 2
    )
  else
    tooltip(
      c,
      l.inset,
      height - 2,
      active?.hint || 'Tab Focus | Enter Open | Esc Back | Ctrl+G Menu',
      width - l.inset * 2
    )
  const footer =
    s.page === 'welcome'
      ? '1 Personal | 2 Server | Enter Choose | Ctrl+Q Quit'
      : width < 80
        ? 'Ctrl+K Help | Ctrl+G Menu | Ctrl+Q Quit'
        : s.mouse
          ? 'Ctrl+K Help | Ctrl+G Menu | Ctrl+X Select text | Ctrl+Q Quit'
          : 'Ctrl+K Help | Ctrl+G Menu | Ctrl+X Enable mouse | Ctrl+Q Quit'
  tooltip(c, l.inset, height - 1, footer, width - l.inset * 2)
  // Never register invisible controls on an unusually narrow viewport.
  c.targets = c.targets.filter((t) => t.width > 0 && t.y >= 0 && t.y < height && t.x < width)
  return c
}
