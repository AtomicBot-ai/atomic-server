import { drawSections, workspacePage } from './navigation.js'
import { messageText } from '../../terminal-service/index.js'
import { fill, drawWelcome } from './draw/fortress.js'
import { drawCockpit } from './server/cockpit.js'
import { drawFooter } from './footer.js'
import { drawSetup } from './setup/setup-panel.js'
import { drawDataPanel } from './data-panels.js'
import type { OrnamentStyle } from './draw/art.js'
import { button, canvas, COLORS, text, wrap } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import { workspaceLayout } from './draw/layout.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { drawPanels } from './panels.js'
import { drawOverlay } from './overlay.js'
import { tooltip } from './draw/tooltip.js'
import { COMPOSER_HEIGHT, drawComposer } from './chat/composer.js'
import { newChatButton } from './chat/chat-navigation.js'
import { drawPicker, isPicker } from './chat/picker.js'
export function workspaceFrame(
  s: WorkspaceState,
  width: number,
  height: number,
  seconds: number,
  _ornament: OrnamentStyle = 'fangs'
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
  const onboarding = s.page === 'welcome' || s.page === 'setup'
  const menuY = l.gate + 2
  if (onboarding) text(c, l.inset, 1, 'ATOMIC CHAT', COLORS.text, width - 4, undefined, true)
  else {
    drawCockpit(c, s, l.gate, seconds, focus)
    fill(c, 0, menuY, width, 2, COLORS.header)
    let nx = l.inset
    PAGES.forEach((p) => {
      nx += button(c, `page:${p.id}`, nx, menuY, p.name, p.hint, focus, workspacePage(s) === p.id, true) + 1
    })
  }
  let x = l.inset + l.sidebar,
    y = l.top + 2,
    bodyWidth = width - x - l.inset
  if (s.page === 'chat' && l.sidebar) {
    newChatButton(c, l.inset, y + 1, l.sidebar - 3, focus)
    text(c, l.inset, y + 3, 'Recents', COLORS.muted)
    s.history
      .slice(0, Math.max(0, l.bottom - y - 6))
      .forEach((h, i) =>
        button(
          c,
          `history:${h.id}`,
          l.inset,
          y + 5 + i,
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
  if (!onboarding) y = drawSections(c, s, x, y, bodyWidth, focus)
  if (s.page === 'welcome') {
    drawWelcome(c, focus, seconds, s.motion, 3, l.bottom)
  } else if (s.page === 'setup' || (s.page === 'models' && s.setup)) {
    drawSetup(c, s, x, y, bodyWidth, l.bottom, focus, seconds)
  } else if (drawDataPanel(c, s, x, y, bodyWidth, l.bottom, focus)) {
    // History and key management share the same responsive content bounds.
  } else if (s.page === 'chat') {
    if (!l.sidebar) {
      newChatButton(c, x + bodyWidth - 17, y, 16, focus)
      y++
    }
    const composerY = l.bottom - COMPOSER_HEIGHT + 1
    if (!s.messages.length) {
      text(c, x, y, s.model ? s.model : 'Choose a model below', COLORS.muted, bodyWidth)
    } else {
      const rows = s.messages.flatMap((m) => [
        m.role === 'user' ? 'YOU' : 'ATOMIC',
        ...wrap(
          messageText(m.content) || (s.generating ? 'Generating…' : 'No text returned.'),
          bodyWidth - 2
        ),
        '',
      ])
      if (rows.at(-1) === '') rows.pop()
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
  drawFooter(c, s, focus)
  // Never register invisible controls on an unusually narrow viewport.
  c.targets = c.targets.filter((t) => t.width > 0 && t.y >= 0 && t.y < height && t.x < width)
  return c
}
