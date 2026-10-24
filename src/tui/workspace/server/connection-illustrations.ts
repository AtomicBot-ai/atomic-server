/** Approved Beacon and Rover drawings; each pose keeps a fixed card-sized footprint. */
type Kind = 'agent' | 'endpoint'
const FULL: Record<Kind, string[][]> = {
  endpoint: [
    ['     (( | ))', '        |', '       /+\\', '      / | \\', '     /__|__\\'],
    ['      ( | )', '        |', '       /+\\', '      / | \\', '     /__|__\\'],
    ['        |', '        |', '       /+\\', '      / | \\', '     /__|__\\'],
  ],
  agent: [
    ['     +-----+', '   __| o o |__', '  /  | [_] |  \\', '     +-----+', '    [o=o=o=o]'],
    ['     +-----+', '   __| - - |__', '  /  | [_] |  \\', '     +-----+', '    [o=o=o=o]'],
    ['     +-----+', '   __| o o |__', '  /  | [_] |  \\', '     +-----+', '    [o-o-o-o]'],
  ],
}
const COMPACT: Record<Kind, string[][]> = {
  endpoint: [
    ['  ((|))', '   /+\\', '  /_|_\\'],
    ['   (|)', '   /+\\', '  /_|_\\'],
    ['    |', '   /+\\', '  /_|_\\'],
  ],
  agent: [
    ['  .---.', '  |o_o|', ' [o=o=o]'],
    ['  .---.', '  |-_-|', ' [o=o=o]'],
    ['  .---.', '  |o_o|', ' [o-o-o]'],
  ],
}

export function connectionIllustration(kind: Kind, seconds: number, compact = true) {
  const time = Math.max(0, seconds)
  const phase =
    kind === 'agent' ? (time % 5.4 >= 4.85 ? 1 : time % 5.4 >= 3.7 ? 2 : 0) : Math.floor(time / 0.8) % 3
  return (compact ? COMPACT : FULL)[kind][phase]!.map((line) => line.padEnd(compact ? 9 : 17))
}
