export type MarkSize = 'large' | 'compact' | 'header' | 'small'
export interface ArmPatch {
  x: number
  y: number
  rows: string[]
  alternate?: string[]
}
const flip = (s: string) =>
  [...s]
    .reverse()
    .map((c) => ({ '/': '\\', '\\': '/', '<': '>', '>': '<' })[c] ?? c)
    .join('')
function mirror(p: ArmPatch, center: number): ArmPatch {
  return {
    x: center * 2 + 1 - p.x - p.rows[0]!.length,
    y: p.y,
    rows: p.rows.map(flip),
    ...(p.alternate ? { alternate: p.alternate.map(flip) } : {}),
  }
}
function pair(p: ArmPatch, center: number): [ArmPatch, ArmPatch] {
  return [p, mirror(p, center)]
}

/** Top, upper-left/right, left/right, lower-left, bottom, lower-right. */
export function armPatches(size: MarkSize): ArmPatch[] {
  if (size === 'large') {
    const top: ArmPatch = { x: 15, y: 0, rows: ['/____\\  '] }
    const bottom: ArmPatch = { x: 15, y: 15, rows: ['\\____/  '] }
    const [ul, ur] = pair({ x: 7, y: 2, rows: [' /__\\', ' |  |'], alternate: ['     ', '/__\\ '] }, 18.5)
    const [l, r] = pair(
      { x: 2, y: 7, rows: [' /_\\', ' |  ', ' \\__'], alternate: ['  __', ' /  ', ' \\__'] },
      18.5
    )
    const [bl, br] = pair({ x: 7, y: 12, rows: [' /  |', ' \\__/'], alternate: [' /__/', '     '] }, 18.5)
    return [
      { ...top, alternate: mirror(top, 18.5).rows },
      ul,
      ur,
      l,
      r,
      bl,
      { ...bottom, alternate: mirror(bottom, 18.5).rows },
      br,
    ]
  }
  if (size === 'compact') {
    const top: ArmPatch = { x: 10, y: 0, rows: ['.----.  '] }
    const bottom: ArmPatch = { x: 10, y: 10, rows: ["'----'  "] }
    const [ul, ur] = pair(
      { x: 4, y: 1, rows: [' /--\\ ', ' |   \\'], alternate: ['.--.  ', ' \\  \\ '] },
      13.5
    )
    const [l, r] = pair(
      { x: 1, y: 4, rows: [' .--', ' /  ', "'---"], alternate: ['.---', ' \\  ', " '--"] },
      13.5
    )
    const [bl, br] = pair({ x: 4, y: 8, rows: [' |   /', " '--' "], alternate: [' /  / ', "'--'  "] }, 13.5)
    return [
      { ...top, alternate: mirror(top, 13.5).rows },
      ul,
      ur,
      l,
      r,
      bl,
      { ...bottom, alternate: mirror(bottom, 13.5).rows },
      br,
    ]
  }
  // The user's small drawing is exact: only its separately rendered eyes animate.
  return []
}

/** Only declared tip cells change; the body and attachment cells are untouched. */
export function paintArmPoses(lines: string[], size: MarkSize, poses: readonly number[]): string[] {
  const cells = lines.map((line) => [...line])
  armPatches(size).forEach((patch, i) => {
    if (!poses[i]) return
    const rows = poses[i]! < 0 ? (patch.alternate ?? patch.rows) : patch.rows
    rows.forEach((row, dy) => {
      for (const [dx, char] of [...row].entries()) cells[patch.y + dy]![patch.x + dx] = char
    })
  })
  return cells.map((row) => row.join(''))
}
