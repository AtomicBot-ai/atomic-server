/** Resolution-aware character art. No image assets, terminal extensions or random state. */
export interface ArtCell {
  char: string
  color: string
}
export type Drawing = ArtCell[][]
const EMPTY = (): ArtCell => ({ char: ' ', color: '#090b0c' })
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * clamp(t))
function glow(t: number, fire = false): string {
  const stops = [
    [7, 34, 35],
    [12, 85, 83],
    [24, 161, 153],
    [79, 225, 207],
    [211, 255, 247],
  ]
  if (fire)
    stops.splice(0, stops.length, [30, 5, 5], [120, 20, 6], [211, 71, 11], [255, 161, 31], [255, 245, 182])
  const at = clamp(t) * 3.999
  const a = stops[Math.floor(at)]!,
    b = stops[Math.floor(at) + 1]!
  return (
    '#' +
    a
      .map((v, i) =>
        mix(v, b[i]!, at % 1)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
/** Unhurried glances with a pause on each target; the outline remains anchored. */
export function gazeAt(seconds: number, motion: boolean): { x: number; y: number } {
  if (!motion) return { x: 0, y: 0 }
  const targets = [
    [0, 0],
    [-0.55, 0.1],
    [0.45, -0.2],
    [0.05, 0],
    [0.65, 0.12],
    [-0.25, -0.1],
  ]
  const phase = seconds / 3.6,
    i = Math.floor(phase) % targets.length
  const a = targets[i]!,
    b = targets[(i + 1) % targets.length]!
  const t = clamp(((phase % 1) - 0.55) / 0.45),
    ease = t * t * (3 - 2 * t)
  return { x: a[0]! + (b[0]! - a[0]!) * ease, y: a[1]! + (b[1]! - a[1]!) * ease }
}
/** Pointed lids, an oval pupil, radial fibres and uneven tongues of fire. */
export type EyeStatus = 'offline' | 'starting' | 'ready' | 'busy' | 'overloaded' | 'error' | 'stopping'
export function drawEye(
  width: number,
  height: number,
  seconds = 0,
  motion = true,
  status: EyeStatus = 'ready'
): Drawing {
  const speed = status === 'starting' ? 4.5 : status === 'overloaded' ? 3.3 : status === 'busy' ? 1.8 : 1
  const gaze = gazeAt(seconds * speed, motion)
  const time = motion ? seconds * speed : 0
  const breath = Math.sin(time * 0.9)
  const compact = height <= 5
  const density = '.:;=+*xX#%@'
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => {
      const x = (col + 0.5 - width / 2) / (width / 2)
      const y = (row + 0.5 - height / 2) / (height / 2)
      const lid = 0.97 * Math.pow(Math.max(0, 1 - Math.abs(x) ** 1.45), 0.72)
      const dx = x - gaze.x * 0.14,
        dy = y - gaze.y * 0.12
      const theta = Math.atan2(dy * 0.68, dx)
      const radius = Math.hypot(dx, dy * 0.68)
      const grain =
        (Math.sin(theta * 51 + radius * 35 - time * 0.85) +
          Math.sin(theta * 93 - radius * 21 + time * 1.15) * 0.45) /
        1.45
      const tongue = 0.045 + 0.11 * (0.5 + 0.5 * Math.sin(x * 82 + Math.sin(x * 29 - time * 0.6) * 5))
      const dist = Math.abs(y) - lid
      const aperture = status === 'offline' ? 0.14 : status === 'stopping' ? 0.38 : 1
      if (Math.abs(y) > aperture || Math.abs(x) > 0.96 || dist > tongue) return EMPTY()
      const pupil = Math.max(
        compact ? 1.05 / width : 0,
        0.24 * (1 + breath * 0.1) * Math.sqrt(Math.max(0, 1 - (dy / 0.78) ** 2))
      )
      if (Math.abs(dx) < pupil && Math.abs(dy) < 0.78) return EMPTY()
      const rim = Math.exp(-Math.abs(dist) * 26)
      const core =
        Math.exp(-Math.abs(Math.abs(dx) - pupil - 0.055) * 8) * (0.5 + 0.5 * Math.max(0, 1 - Math.abs(dy)))
      const heat = clamp(
        0.24 + core * (0.7 + breath * 0.025) + rim * 0.24 + grain * 0.17 - Math.max(0, dist) * 4
      )
      if (dist > 0 && heat < 0.18) return EMPTY()
      const char = density[Math.min(density.length - 1, Math.floor(heat * density.length))]!
      const dim = status === 'offline' ? 0.3 : status === 'error' ? 0.55 + Math.sin(time * 2.5) * 0.3 : 1
      return { char, color: glow(heat * dim, status === 'overloaded' || status === 'error') }
    })
  )
}
/** About 4:3 on 2:1 terminal cells, including the eye's small horizontal inset. */
export function eyeSize(width: number, height: number): { width: number; height: number } {
  const share = height >= 12 ? 2 / 3 : 1
  const maxWidth = Math.max(1, Math.floor(width * share)),
    maxHeight = Math.max(1, Math.floor(height * share))
  const columnsPerRow = ((4 / 3) * 2) / 0.96
  const rows = Math.max(1, Math.min(maxHeight, Math.floor(maxWidth / columnsPerRow)))
  return { width: Math.min(maxWidth, Math.round(rows * columnsPerRow)), height: rows }
}
export const ORNAMENT_STYLES = ['crown', 'barbs', 'lattice', 'fangs'] as const
export type OrnamentStyle = (typeof ORNAMENT_STYLES)[number]
/** Complete, centred motifs; never crop a repeating tile at the terminal's edge. */
export function gateRows(width: number, height: number, style: OrnamentStyle = 'fangs'): string[] {
  const rows = Array.from({ length: height }, () => Array<string>(width).fill(' '))
  const place = (motif: string[], center: number, bottom = height) => {
    const w = Math.max(...motif.map((r) => r.length))
    motif.forEach((row, y) => {
      const at = bottom - motif.length + y
      if (at < 0 || at >= height) return
      for (let x = 0; x < row.length; x++) {
        const col = Math.floor(center - w / 2) + x
        if (col >= 0 && col < width && row[x] !== ' ') rows[at]![col] = row[x]!
      }
    })
  }
  const center = width / 2
  if (style === 'crown') {
    const peak = (h: number) =>
      h === 1
        ? ['/\\']
        : h === 2
          ? [' /\\ ', '/||\\']
          : h === 3
            ? [' /\\ ', '<||>', ' || ']
            : Array.from({ length: h }, (_, y) =>
                y === 0
                  ? ' '.repeat(h - 1) + '/\\'
                  : y === h - 1
                    ? ' '.repeat(h - 1) + '||'
                    : y === h - 2
                      ? ' '.repeat(h - 2) + '\\||/'
                      : ' '.repeat(h - y - 1) + '/' + ':'.repeat(y - 1) + '||' + ':'.repeat(y - 1) + '\\'
              )
    const step = Math.max(10, height * 3 + 3)
    place(peak(height), center)
    for (let i = 1; i * step + height < width / 2 - 3; i++) {
      const h = Math.max(1, height - Math.ceil(i / 2))
      place(peak(h), center - i * step)
      place(peak(h), center + i * step)
    }
  } else if (style === 'barbs') {
    const motif =
      height <= 1
        ? ['>><<']
        : height <= 2
          ? [' \\  / ', '>> \\/ <<']
          : ['  \\      /  ', '   \\ /\\ /   ', '>>> <    > <<<', '   / \\/ \\   ', '  /      \\  '].slice(
              0,
              height
            )
    const step = 24
    const count = Math.max(1, Math.floor((width - 8) / step))
    for (let i = 0; i < count; i++) place(motif, center + (i - (count - 1) / 2) * step)
  } else if (style === 'lattice') {
    const motif =
      height <= 1
        ? ['<>  <>']
        : height <= 2
          ? [' /\\  /\\ ', ' \\/  \\/ ']
          : [
              '   /\\    /\\   ',
              '  /  \\  /  \\  ',
              ' < /\\ >< /\\ > ',
              '  \\/  \\/  \\/  ',
              '   \\  /\\  /   ',
            ].slice(0, height)
    const step = height <= 2 ? 12 : 16
    const count = Math.max(1, Math.floor((width - 8) / step))
    for (let i = 0; i < count; i++) place(motif, center + (i - (count - 1) / 2) * step)
  } else {
    const motif =
      height <= 1
        ? ['/\\  /\\']
        : height <= 2
          ? [' /\\  /\\ ', '/ /\\/\\ \\']
          : ['    /\\    ', ' /\\/  \\/\\ ', '/ / /\\ \\ \\', ' / /  \\ \\ ', '  /    \\  '].slice(0, height)
    const step = Math.max(...motif.map((r) => r.length)) + 2
    const count = Math.max(1, Math.floor((width - 2) / step))
    for (let i = 0; i < count; i++) place(motif, center + (i - (count - 1) / 2) * step)
  }
  return rows.map((r) => r.join(''))
}
