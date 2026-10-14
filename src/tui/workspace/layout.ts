export interface WorkspaceLayout {
  tier: 'compact' | 'standard' | 'wide'
  inset: number
  top: number
  bottom: number
  width: number
  gate: number
  sidebar: number
}
export function workspaceLayout(columns: number, rows: number): WorkspaceLayout {
  const tier = columns >= 140 && rows >= 40 ? 'wide' : columns >= 100 && rows >= 30 ? 'standard' : 'compact'
  const inset = tier === 'wide' ? 5 : 2
  const gate = Math.min(9, Math.max(5, Math.floor(rows * 0.2)))
  const top = gate + 3,
    bottom = rows - 4
  const sidebar = tier !== 'compact' ? 22 : 0
  const width = Math.max(12, columns - inset * 2 - sidebar)
  return {
    tier,
    inset,
    top,
    bottom,
    width,
    gate,
    sidebar,
  }
}
