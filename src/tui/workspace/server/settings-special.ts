import { COLORS, text } from '../draw/canvas.js'
import { drawFeatureSettings } from './feature-panel.js'
import { scrollTrack } from '../draw/controls.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'

export const SHORTCUTS = [
  ['Tab / Shift+Tab', 'Next / previous control'],
  ['Enter', 'Open or activate'],
  ['Esc', 'Close dialog or go back'],
  ['Alt+1 / 2 / 3 / 4', 'Server / Models / Settings / Playground'],
  ['Ctrl+K', 'Keyboard shortcuts'],
  ['F4', 'Server console'],
  ['Ctrl+N / Ctrl+P', 'New chat / history'],
  ['Ctrl+X', 'Mouse / text selection'],
  ['Ctrl+C', 'Stop a response'],
  ['Ctrl+Q', 'Close terminal; server stays running'],
  ['Shift+Enter / Alt+Enter', 'New line in composer'],
  ['PageUp / PageDown', 'Scroll current view'],
] as const

export function drawSpecialSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
): boolean {
  if (s.settingsGroup === 'shortcuts') {
    text(c, x, y, 'Keyboard shortcuts', COLORS.text, width, undefined, true)
    const capacity = Math.max(1, Math.floor((bottom - y - 2) / 2))
    const offset = Math.min(s.scroll, Math.max(0, SHORTCUTS.length - capacity))
    SHORTCUTS.slice(offset, offset + capacity).forEach(([key, label], i) => {
      text(c, x, y + 2 + i * 2, label, COLORS.text, width - 2)
      text(c, x, y + 3 + i * 2, key, COLORS.muted, width - 2)
    })
    scrollTrack(c, x + width - 1, y + 2, capacity * 2, offset, capacity, SHORTCUTS.length)
    return true
  }
  if (!['assistants', 'connectors', 'skills', 'attachments'].includes(s.settingsGroup)) return false
  drawFeatureSettings(c, s, x, y, width, bottom, focus)
  return true
}
