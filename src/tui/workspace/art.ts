/** Resolution-aware character art. No image assets, terminal extensions or random state. */
export interface ArtCell {
  char: string
  color: string
}
export type Drawing = ArtCell[][]
const EMPTY = (): ArtCell => ({ char: ' ', color: '#101014' })
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * clamp(t))
function fire(t: number): string {
  const stops = [
    [49, 16, 24],
    [126, 27, 30],
    [224, 57, 30],
    [255, 135, 45],
    [255, 217, 130],
  ]
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
/** A slow gaze with long rests. The pupil moves; the outline does not wobble. */
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
  const phase = seconds / 4.8,
    i = Math.floor(phase) % targets.length
  const a = targets[i]!,
    b = targets[(i + 1) % targets.length]!
  const t = clamp(((phase % 1) - 0.72) / 0.28),
    ease = t * t * (3 - 2 * t)
  return { x: a[0]! + (b[0]! - a[0]!) * ease, y: a[1]! + (b[1]! - a[1]!) * ease }
}
/** Pointed lids, a vertical void, radial fibres and uneven tongues of fire. */
export function drawEye(width: number, height: number, seconds = 0, motion = true): Drawing {
  const gaze = gazeAt(seconds, motion)
  const compact = height <= 5
  const density = '.:;=+*xX#%@'
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => {
      const x = (col + 0.5 - width / 2) / (width / 2)
      const y = (row + 0.5 - height / 2) / (height / 2)
      const lid = 0.74 * Math.pow(Math.max(0, 1 - Math.abs(x) ** 1.45), 0.72)
      const dx = x - gaze.x * 0.14,
        dy = y - gaze.y * 0.12
      const theta = Math.atan2(dy * 0.68, dx)
      const radius = Math.hypot(dx, dy * 0.68)
      const grain = (Math.sin(theta * 51 + radius * 35) + Math.sin(theta * 93 - radius * 21) * 0.45) / 1.45
      const tongue = 0.045 + 0.11 * (0.5 + 0.5 * Math.sin(x * 82 + Math.sin(x * 29) * 5))
      const dist = Math.abs(y) - lid
      if (Math.abs(x) > 0.96 || dist > tongue) return EMPTY()
      const slit = (compact ? 0.065 : 0.05) * Math.max(0, 1 - (dy / 0.8) ** 2)
      if (Math.abs(dx) < slit && Math.abs(dy) < 0.78) return EMPTY()
      const rim = Math.exp(-Math.abs(dist) * 26)
      const core =
        Math.exp(-Math.abs(Math.abs(dx) - slit - 0.055) * 8) * (0.5 + 0.5 * Math.max(0, 1 - Math.abs(dy)))
      const heat = clamp(0.24 + core * 0.7 + rim * 0.24 + grain * 0.17 - Math.max(0, dist) * 4)
      if (dist > 0 && heat < 0.18) return EMPTY()
      const char = density[Math.min(density.length - 1, Math.floor(heat * density.length))]!
      return { char, color: fire(heat) }
    })
  )
}
/** Repeating iron spires grow in detail instead of stretching the same glyphs. */
export function gateRows(width: number, height: number): string[] {
  const small = ['/\\  ']
  const medium = [
    '    /\\        /\\    ',
    ' /\\/||\\/\\  /\\/||\\/\\ ',
    '/||\\||/||\\/||\\||/||\\',
    '==++==++==++==++==++==',
  ]
  const large = [
    '          /\\          ',
    '         /||\\         ',
    '    /\\ /:||:\\ /\\    ',
    '   /||\\/:||:\\/||\\   ',
    '/\\/||\\/=||=\\/||\\/\\',
    '|::|++|\\=||=/|++|::|',
    '|==|::|<>||||<>|::|==|',
    '+--+--+--++++--+--+--+',
  ]
  const source = height <= 1 ? small : height <= 4 ? medium : large
  return Array.from({ length: height }, (_, i) => {
    const raw = source[Math.min(i, source.length - 1)]!
    const row = height > 1 ? raw.padEnd(24) : raw
    return row.repeat(Math.ceil(width / row.length)).slice(0, width)
  })
}
