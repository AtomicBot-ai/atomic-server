import { PAGES } from '../workspace-pages.js'
import { COLORS, text } from '../draw/canvas.js'
import { drawFeatureSettings } from './feature-panel.js'
import { scrollTrack } from '../draw/controls.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { drawAccountSettings } from '../account/account-panel.js'
import { ACCOUNT_SHORTCUTS } from '../account/account-input.js'
import { shownAccount } from '../account/account-model.js'

export const SHORTCUTS = [
  ['Tab / Shift+Tab', 'Next / previous control'],
  ['Enter', 'Open or activate'],
  ['Esc', 'Close dialog or go back'],
  ['Alt+1 / 2 / 3 / 4', PAGES.map((p) => p.name).join(' / ')],
  ['Ctrl+K', 'Help'],
  ['F4', 'Server console'],
  ['Ctrl+N / Ctrl+P', 'New chat / history'],
  ['Ctrl+X', 'Mouse / text selection'],
  ['Ctrl+C', 'Stop a response'],
  ['Ctrl+Q', 'Close terminal; server stays running'],
  ['Shift+Enter / Alt+Enter', 'New line in composer'],
  ['PageUp / PageDown', 'Scroll current view'],
] as const

/** Every shortcut this terminal answers to; the account's only while accounts are on. */
export function shortcutRows(s: Pick<WorkspaceState, 'workspace'>): readonly (readonly [string, string])[] {
  return shownAccount(s.workspace) ? [...SHORTCUTS, ...ACCOUNT_SHORTCUTS] : SHORTCUTS
}

export function drawSpecialSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
): boolean {
  if (drawAccountSettings(c, s, x, y, width, focus)) return true
  if (s.settingsGroup === 'shortcuts') {
    const rows = shortcutRows(s)
    text(c, x, y, 'Keyboard shortcuts', COLORS.text, width, undefined, true)
    const capacity = Math.max(1, Math.floor((bottom - y - 2) / 2))
    const offset = Math.min(s.scroll, Math.max(0, rows.length - capacity))
    rows.slice(offset, offset + capacity).forEach(([key, label], i) => {
      text(c, x, y + 2 + i * 2, label, COLORS.text, width - 2)
      text(c, x, y + 3 + i * 2, key, COLORS.muted, width - 2)
    })
    scrollTrack(c, x + width - 1, y + 2, capacity * 2, offset, capacity, rows.length)
    return true
  }
  if (!['assistants', 'connectors', 'skills', 'attachments'].includes(s.settingsGroup)) return false
  drawFeatureSettings(c, s, x, y, width, bottom, focus)
  return true
}
