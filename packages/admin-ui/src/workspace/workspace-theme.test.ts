import { expect, it } from 'vitest'
import { workspaceTheme } from './workspace-theme'

function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
}

it.each([
  ['text', 'header'],
  ['text', 'surface'],
  ['muted', 'nav-button'],
  ['accent', 'focus'],
  ['on-accent', 'accent'],
  ['on-accent', 'green'],
  ['status-error', 'header'],
  ['status-running', 'surface'],
  ['status-starting', 'surface'],
])('keeps readable light-theme contrast for %s on %s', (foreground, background) => {
  const colors = workspaceTheme('light') as Record<string, string>
  const a = luminance(colors[`--atomic-${foreground}`]!),
    b = luminance(colors[`--atomic-${background}`]!)
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
})
