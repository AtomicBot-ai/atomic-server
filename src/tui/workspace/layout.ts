export interface WorkspaceLayout {
  tier: 'compact' | 'standard' | 'wide'
  inset: number
  top: number
  bottom: number
  width: number
  gate: number
  eyeWidth: number
  eyeHeight: number
  sidebar: number
}
export function workspaceLayout(columns: number, rows: number): WorkspaceLayout {
  const tier = columns >= 140 && rows >= 40 ? 'wide' : columns >= 100 && rows >= 30 ? 'standard' : 'compact'
  const inset = tier === 'wide' ? 5 : 2
  const gate = tier === 'wide' ? 8 : tier === 'standard' ? 4 : 1
  const top = gate + 4,
    bottom = rows - 4
  const sidebar = tier === 'wide' ? 22 : 0
  const width = Math.max(12, columns - inset * 2 - sidebar)
  const eyeHeight = Math.max(
    3,
    Math.min(tier === 'wide' ? 24 : tier === 'standard' ? 13 : 7, bottom - top - 9)
  )
  return {
    tier,
    inset,
    top,
    bottom,
    width,
    gate,
    sidebar,
    eyeHeight,
    eyeWidth: Math.min(width - 4, eyeHeight * 5, 122),
  }
}
