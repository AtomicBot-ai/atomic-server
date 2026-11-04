// Lifted from Atomic-Chat/web-app/src/components/left-sidebar/NavigationRail.tsx @ 807b4d9; adapted: terminal support popup.
import type { WorkspaceState } from '../state.js'
import { COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { navigationRow } from '../draw/controls.js'

export const SUPPORT_LINKS = [
  { id: 'support:email', label: '[@] Email support', url: 'mailto:support@atomic.chat' },
  { id: 'support:discord', label: '[#] Discord', url: 'https://discord.com/invite/FTk2MvZwJH' },
  {
    id: 'support:github',
    label: '[+] New GitHub issue',
    url: 'https://github.com/AtomicBot-ai/Atomic-Chat/issues/new',
  },
] as const

export function drawHelp(c: Canvas, s: WorkspaceState, focus: string) {
  const width = Math.min(42, c.width - 8),
    height = 16
  const x = Math.floor((c.width - width) / 2),
    y = Math.floor((c.height - height) / 2)
  c.targets = []
  c.popover = { x, y, width, height }
  panel(c, x, y, width, height)
  text(c, x + 3, y + 2, 'Help', COLORS.text, width - 6, undefined, true)
  text(
    c,
    x + 2,
    y + 3,
    s.page === 'chat' ? 'Enter Send · Ctrl+C Stop · Ctrl+N New' : 'Tab Move · Enter Select · Esc Back',
    COLORS.muted,
    width - 4
  )
  navigationRow(c, 'open-admin', x + 2, y + 13, width - 4, 'Open web admin', focus)
  SUPPORT_LINKS.forEach((link, i) =>
    navigationRow(c, link.id, x + 2, y + 6 + i * 2, width - 4, link.label, focus, false, link.label)
  )
  navigationRow(c, 'settings-section:shortcuts', x + 2, y + 12, width - 4, 'Keyboard shortcuts', focus)
}
