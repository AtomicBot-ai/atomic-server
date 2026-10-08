import { drawEye, gateRows } from './art.js'
import { art, button, canvas, COLORS, rule, text, graphemes, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
import { workspaceLayout } from './layout.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { drawPanels } from './panels.js'
import { drawOverlay } from './overlay.js'
export function workspaceFrame(s: WorkspaceState, width: number, height: number, seconds: number): Canvas {
  const c = canvas(width, height),
    l = workspaceLayout(width, height)
  const focus = s.hover || s.focus
  if (width < 54 || height < 24) {
    text(c, 1, 1, 'ATOMIC CHAT', COLORS.gold)
    wrap('Expand to at least 54 columns and 24 rows. Ctrl+Q closes the console.', width - 2).forEach((r, i) =>
      text(c, 1, 3 + i, r)
    )
    return c
  }
  gateRows(width, l.gate).forEach((r, y) => text(c, 0, y, r, y === l.gate - 1 ? COLORS.stone : COLORS.line))
  text(c, l.inset, l.gate + 1, '<|>', COLORS.red)
  text(c, l.inset + 5, l.gate + 1, 'ATOMIC CHAT', COLORS.text)
  const state =
    s.page === 'chat'
      ? 'Personal terminal'
      : s.base.daemon.kind === 'up'
        ? s.base.daemon.snapshot.server.running
          ? 'API running'
          : 'API stopped'
        : 'Server offline'
  text(
    c,
    width - state.length - l.inset,
    l.gate + 1,
    state,
    s.base.daemon.kind === 'up' ? COLORS.green : COLORS.muted
  )
  let nx = l.inset
  if (s.page !== 'welcome')
    PAGES.forEach((p) => {
      nx +=
        button(
          c,
          `page:${p.id}`,
          nx,
          l.gate + 3,
          p.name,
          p.hint,
          focus,
          s.page === p.id || (p.id === 'server' && ['requests', 'access'].includes(s.page))
        ) + 2
    })
  let x = l.inset + l.sidebar,
    y = l.top + 2,
    bodyWidth = width - x - l.inset
  if (s.page === 'chat' && l.sidebar) {
    text(c, l.inset, y, 'THIS CHAT', COLORS.muted)
    button(c, 'new', l.inset, y + 2, '+ New chat', 'Start an empty conversation. Ctrl+N', focus)
    text(c, l.inset, y + 5, s.messages[0]?.content ?? 'Your next idea', COLORS.muted, l.sidebar - 3)
    text(c, l.inset, l.bottom - 1, 'Personal workspace', COLORS.stone, l.sidebar - 1)
  } else {
    x = l.inset
    bodyWidth = width - x - l.inset
  }
  if (s.page === 'welcome') {
    const title = 'How will you use Atomic Chat?'
    y = Math.max(y, Math.floor(height / 2) - 5)
    text(c, Math.max(x, Math.floor((width - title.length) / 2)), y, title, COLORS.gold)
    text(
      c,
      x,
      y + 2,
      'Choose your starting workspace. You can change it at any time.',
      COLORS.muted,
      bodyWidth
    )
    const bx = l.tier === 'compact' ? x : Math.max(x, Math.floor((width - 64) / 2))
    button(
      c,
      'personal',
      bx,
      y + 4,
      '1  Personal terminal',
      'Chat and experiment with a local or connected model. Enter to choose.',
      focus
    )
    button(
      c,
      'hosting',
      l.tier === 'compact' ? bx : bx + 35,
      y + (l.tier === 'compact' ? 6 : 4),
      '2  Server console',
      'Run an API for your apps and monitor its requests. Enter to choose.',
      focus
    )
    if (l.tier !== 'compact') {
      text(c, bx, y + 6, 'A quiet space to think and build.', COLORS.muted, 33)
      text(c, bx + 35, y + 6, 'An API you can see and control.', COLORS.muted, 33)
    }
  } else if (s.page === 'chat') {
    const composerY = l.bottom - 4
    if (!s.messages.length) {
      const eh = Math.max(3, Math.min(l.eyeHeight, composerY - y - 3)),
        ew = Math.min(bodyWidth - 4, Math.max(56, eh * 5), 122)
      const ey = y + Math.max(0, Math.floor((composerY - y - eh - 2) / 2))
      art(c, x + Math.floor((bodyWidth - ew) / 2), ey, drawEye(ew, eh, seconds, s.motion))
      const line = s.model ? 'What would you like to explore?' : 'Your next idea starts here.'
      text(
        c,
        x + Math.max(0, Math.floor((bodyWidth - line.length) / 2)),
        Math.min(composerY - 1, ey + eh + 1),
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
    rule(c, x, composerY, bodyWidth)
    const chars = graphemes(s.draft)
    if (s.focus === 'composer' && !s.overlay) chars.splice(s.cursor, 0, '▏')
    const draftRows = wrap(
      s.draft ? chars.join('') : s.focus === 'composer' ? '▏ Write a message...' : 'Write a message...',
      bodyWidth - 4
    )
    draftRows
      .slice(-2)
      .forEach((r, i) =>
        text(c, x + 2, composerY + 1 + i, r, s.draft ? COLORS.text : COLORS.muted, bodyWidth - 4)
      )
    c.targets.push({
      id: 'composer',
      x,
      y: composerY + 1,
      width: bodyWidth,
      height: 2,
      hint: 'Enter sends. Alt+Enter adds a line. Escape leaves the editor. Ctrl+N starts a new chat.',
    })
    if (s.focus === 'composer' && !s.hover) text(c, x, composerY + 1, '>', COLORS.gold)
    let cx = x
    cx +=
      button(
        c,
        'choose-model',
        cx,
        l.bottom,
        s.model ? `Model: ${s.model.slice(0, l.tier === 'compact' ? 15 : 32)}` : 'Choose a model',
        'Choose a model from your endpoint. Ctrl+G then M',
        focus
      ) + 1
    cx += button(c, 'endpoint', cx, l.bottom, 'Connect', 'Edit the OpenAI-compatible endpoint.', focus) + 1
    button(
      c,
      s.generating ? 'cancel' : 'send',
      Math.max(cx, width - l.inset - 10),
      l.bottom,
      s.generating ? 'Stop' : 'Send',
      s.generating ? 'Stop this response. Ctrl+C' : 'Send your message. Enter in the editor',
      focus
    )
  } else drawPanels(c, s, { x, y, width: bodyWidth, bottom: l.bottom }, focus)
  rule(c, l.inset, height - 3, width - l.inset * 2)
  const active = c.targets.find((t) => t.id === focus)
  text(
    c,
    l.inset,
    height - 2,
    s.message ||
      s.base.busy ||
      active?.hint ||
      'Tab focuses controls. Enter opens. Esc returns. Ctrl+G opens the menu.',
    s.message ? COLORS.gold : COLORS.muted,
    width - l.inset * 2
  )
  const footer = s.mouse
    ? 'Ctrl+K Help  |  Ctrl+G Menu  |  Ctrl+X Select text  |  Ctrl+Q Quit'
    : 'Ctrl+K Help  |  Ctrl+G Menu  |  Ctrl+X Enable mouse  |  Ctrl+Q Quit'
  text(c, l.inset, height - 1, footer, COLORS.stone, width - l.inset * 2)
  if (s.overlay) drawOverlay(c, s, focus)
  // Never register invisible controls on an unusually narrow viewport.
  c.targets = c.targets.filter((t) => t.width > 0 && t.y >= 0 && t.y < height && t.x < width)
  return c
}
