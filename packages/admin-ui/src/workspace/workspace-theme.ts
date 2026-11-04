import type { CSSProperties } from 'react'
import { WORKSPACE_COLORS } from '@view'

/** Semantic pairs must change together: light labels must never inherit dark control surfaces. */
export const LIGHT_COLORS = {
  ...WORKSPACE_COLORS,
  ground: '#fafafa',
  surface: '#ffffff',
  header: '#efefef',
  text: '#202023',
  muted: '#626269',
  line: '#d7d7da',
  stone: '#626269',
  navButton: '#edf2f0',
  navEdge: '#b8c4c0',
  focus: '#e3f0ec',
  accent: '#237460',
  accentLight: '#176652',
  green: '#176652',
  engineButton: '#e3f0ec',
  statusRunning: '#236c39',
  statusStarting: '#855500',
  statusStopped: '#626269',
  statusError: '#a3302b',
} as const
export function workspaceTheme(theme: 'light' | 'dark' = 'dark'): CSSProperties {
  const colors = theme === 'light' ? LIGHT_COLORS : WORKSPACE_COLORS
  return Object.fromEntries(
    Object.entries({
      ...colors,
      controlBorder: theme === 'light' ? '#708a80' : '#66897d',
      focusRing: theme === 'light' ? '#086759' : '#84e1cc',
      onAccent: theme === 'light' ? '#ffffff' : colors.composerInk,
    }).map(([name, value]) => [
      `--atomic-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ])
  ) as CSSProperties
}
