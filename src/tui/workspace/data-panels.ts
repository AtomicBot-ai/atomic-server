import { button, COLORS, text } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { computeRowWindow } from '../row-window.js'
export function drawDataPanel(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
): boolean {
  if (s.page === 'history') {
    text(c, x, y, 'Your conversations', COLORS.gold)
    button(
      c,
      'history-search',
      x,
      y + 2,
      `Search: ${s.historyFilter || 'All conversations'}`,
      'Filter by title, model, or working directory.',
      focus
    )
    const entries = s.history.filter((h) =>
      `${h.title} ${h.model} ${h.workingDirectory}`.toLowerCase().includes(s.historyFilter.toLowerCase())
    )
    const win = computeRowWindow(entries.length, s.selected, Math.max(1, Math.floor((bottom - y - 5) / 2)))
    entries.slice(win.start, win.start + win.count).forEach((h, i) => {
      const date = new Date(h.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      button(
        c,
        `history:${h.id}`,
        x,
        y + 4 + i * 2,
        h.title.slice(0, width - 4),
        'Resume this conversation with its saved model and context. Enter opens.',
        focus,
        h.id === s.conversation?.id
      )
      text(
        c,
        x + 1,
        y + 5 + i * 2,
        `${date}  /  ${h.turns} turns  /  ${h.model}  /  ${h.workingDirectory}`,
        COLORS.muted,
        width - 2
      )
    })
    if (!entries.length)
      text(c, x, y + 5, 'Your first conversation will appear here automatically.', COLORS.muted, width)
    button(c, 'new', x, bottom, '+ New chat', 'Start a new conversation. Ctrl+N', focus)
    if (s.conversation) {
      button(
        c,
        'rename-chat',
        x + 14,
        bottom,
        'Rename current',
        'Give the current conversation a title.',
        focus
      )
      button(
        c,
        'delete-chat',
        x + 32,
        bottom,
        'Delete current',
        'Delete the current conversation after confirmation.',
        focus
      )
    }
  } else if (s.page === 'keys') {
    text(c, x, y, 'API keys', COLORS.gold)
    text(c, x, y + 2, 'One key per app. Revocation takes effect on its next request.', COLORS.muted, width)
    const win = computeRowWindow(
      s.clientKeys.length,
      s.selected,
      Math.max(1, Math.floor((bottom - y - 5) / 3))
    )
    s.clientKeys.slice(win.start, win.start + win.count).forEach((k, i) => {
      const row = y + 4 + i * 3
      text(c, x, row, `${k.name}  /  ${k.preview}`, COLORS.text, width)
      let bx = x
      for (const [action, label, hint] of [
        ['copy', 'Copy', 'Copy this API key.'],
        ['reveal', 'Reveal', 'Show this key for one minute.'],
        ['revoke', 'Revoke', 'Permanently revoke this key after confirmation.'],
      ])
        bx += button(c, `key-${action}:${k.id}`, bx, row + 1, label!, hint!, focus) + 1
    })
    button(c, 'key-new', x, bottom, '+ Create key', 'Create a named key for an app or agent.', focus)
    button(c, 'page:server', x + 17, bottom, '< Server', 'Return to the API dashboard.', focus)
  } else return false
  return true
}
