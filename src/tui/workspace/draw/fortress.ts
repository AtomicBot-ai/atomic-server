import { drawEye, eyeSize } from './art.js'
import { art, COLORS, text, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
export function fill(c: Canvas, x: number, y: number, width: number, height: number, background: string) {
  for (let row = y; row < y + height; row++)
    text(c, x, row, ' '.repeat(Math.max(0, width)), COLORS.text, width, background)
}
/** The whole slab is one focus and mouse target, including its inscription. */
export function stonePlate(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  tagline: string,
  focus: string
) {
  const active = focus === id,
    background = active ? COLORS.text : COLORS.surface,
    ink = active ? COLORS.ground : COLORS.text
  fill(c, x, y, width, height, background)
  const put = (dy: number, value: string) => text(c, x, y + dy, value, ink, width, background)
  put(0, '/' + '='.repeat(width - 2) + '\\')
  for (let i = 1; i < height - 1; i++) put(i, '|' + ' '.repeat(width - 2) + '|')
  put(height - 1, '\\' + '='.repeat(width - 2) + '/')
  text(c, x + 2, y + 1, title, ink, width - 4, background)
  wrap(tagline, width - 4)
    .slice(0, height - 3)
    .forEach((line, i) => text(c, x + 2, y + 2 + i, line, ink, width - 4, background))
  c.targets.push({ id, x, y, width, height, hint: 'Enter Choose | Tab Switch workspace' })
}
/** Keep the same detailed eye at every scale, with no flanking architecture. */
export function eyeArtwork(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  seconds: number,
  motion: boolean
) {
  const size = eyeSize(width, height)
  const left = x + Math.floor((width - size.width) / 2),
    top = y + Math.floor((height - size.height) / 2)
  if (size.height >= 3) art(c, left, top, drawEye(size.width, size.height, seconds, motion))
  return { x: left, y: top, ...size }
}
export function drawWelcome(
  c: Canvas,
  focus: string,
  seconds: number,
  motion: boolean,
  top: number,
  bottom: number
) {
  const narrow = c.width < 88,
    slabHeight = 5
  const plateY = Math.max(top + 4, bottom - (narrow ? 12 : 7))
  eyeArtwork(c, 4, top, c.width - 8, Math.max(3, plateY - top - 1), seconds, motion)
  const w = narrow ? c.width - 8 : Math.min(48, Math.floor((c.width - 10) / 2)),
    sx = narrow ? 4 : Math.floor((c.width - w * 2 - 3) / 2)
  stonePlate(
    c,
    'hosting',
    sx,
    plateY,
    w,
    slabHeight,
    '[1] SET UP SERVER',
    'Connect agents or expose a model API.',
    focus
  )
  stonePlate(
    c,
    'setup-manual',
    narrow ? sx : sx + w + 3,
    plateY + (narrow ? slabHeight + 1 : 0),
    w,
    slabHeight,
    '[2] SET UP MANUALLY',
    'Open Server. Configure services later.',
    focus
  )
  const label = '[3] Set up with an agent'
  text(c, sx, bottom, label, focus === 'agent-setup' ? COLORS.gold : COLORS.muted)
  c.targets.push({
    id: 'agent-setup',
    x: sx,
    y: bottom,
    width: label.length,
    height: 1,
    hint: 'Copy agent setup instructions and MCP configuration',
  })
}
/** One crossing per minute, starting after the first minute; no timer or I/O in the art. */
export function drawRider(c: Canvas, y: number, elapsed: number, motion: boolean, compact = false) {
  if (!motion || elapsed < 60 || elapsed % 60 >= 9) return
  const phase = elapsed % 60,
    x = Math.floor((phase / 9) * (c.width + 22)) - 22
  const legs = Math.floor(phase * 6) % 2 === 0 ? '  / /  / /' : '   \\ \\  \\ \\'
  const rider = compact
    ? ['   o/|  /\\', ' _/###\\/_)~'].concat(legs)
    : ['       /|', '    o / |', '   /|/  |   /\\', ' _/###\\___/  )~', '(_________ /'].concat(legs)
  rider.forEach((row, i) =>
    [...row].forEach((char, j) => {
      if (x + j >= 0) text(c, x + j, y + i, char, COLORS.stone, 1)
    })
  )
}
