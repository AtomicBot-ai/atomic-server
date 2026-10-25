/** The approved Drafting outline, with status eyes kept inside its contour. */
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { COLORS, text } from './canvas.js'
import type { Canvas } from './canvas.js'
import { animatedContour } from './brand-motion.js'
import { contourSilhouette } from './brand-silhouette.js'
import { animatedIntroContour } from './brand-intro-motion.js'
import { introPupil, INTRO_WAKE_SECONDS } from './brand-wake.js'

export type BrandStatus = 'welcome' | 'running' | 'starting' | 'stopped' | 'error'
export const BRAND_SHADOW = '#303638'
export const BRAND_COLORS = {
  running: COLORS.statusRunning,
  starting: COLORS.statusStarting,
  stopped: COLORS.statusStopped,
  error: COLORS.statusError,
}
export const LARGE_MARK = String.raw`
                 ____
                /    \
        __      |    |      __
       /  \     |    |     /  \
       \   \    |    |    /   /
        \   \___|    |___/   /
         \                  /
   ______/                  \______
  /                                \
  \______                    ______/
         \                  /
        /    ___      ___    \
       /   /    |    |    \   \
       \__/     |    |     \__/
                |    |
                \____/`
  .split('\n')
  .slice(1)
  .map((line) => line.padEnd(38))
export const COMPACT_MARK = String.raw`
           .----.
    .--.   |    |   .--.
    |   \__|    |__/   |
    '._              _.'
 .-----'            '-----.
 |                        |
 '-----.            .-----'
    .-'              '-.
    |   /--|    |--\   |
    '--'   |    |   '--'
           '----'`
  .split('\n')
  .slice(1)
  .map((line) => line.padEnd(27))
// The user's exact three lines with the requested top cap.
export const HEADER_MARK = String.raw`
  ___ _ ___
 _\ \| |/ /_
[_  (o)(o) _]
  / /| |\ \ `
  .split('\n')
  .slice(1)
  .map((line) => line.padEnd(13))
export const SMALL_MARK = HEADER_MARK

/** Map the shared server snapshot only; missing data is neutral, never an invented error. */
export function brandStatus(eye?: WorkspaceSnapshot['eye']): BrandStatus {
  if (eye === 'error' || eye === 'overloaded') return 'error'
  if (eye === 'starting') return 'starting'
  if (eye === 'offline') return 'stopped'
  return eye === 'ready' || eye === 'busy' ? 'running' : 'welcome'
}

export function drawBrandMark(
  c: Canvas,
  x: number,
  y: number,
  size: 'large' | 'compact' | 'header' | 'small',
  status: BrandStatus = 'welcome',
  seconds = 0,
  motion = true,
  shadow = false
) {
  const lines =
    size === 'large'
      ? LARGE_MARK
      : size === 'compact'
        ? COMPACT_MARK
        : size === 'header'
          ? HEADER_MARK
          : SMALL_MARK
  const outline = lines.map((line) => line.replace('(o)(o)', '      '))
  const color = status === 'error' ? BRAND_COLORS.error : COLORS.text
  const center = size === 'large' ? 18.5 : size === 'compact' ? 13.5 : 6
  const contour = shadow
    ? animatedIntroContour(outline, size, seconds, motion, status)
    : animatedContour(outline, center, seconds, motion, status)
  const silhouette = shadow ? contourSilhouette(contour, size === 'compact' ? [3, 4, 5, 6, 7] : []) : []
  const draw = (dx: number, dy: number, ink: string, exterior = false) => {
    contour.forEach((line, row) => {
      for (const [column, char] of [...line].entries())
        if (char !== ' ' && (!exterior || !silhouette[row + dy]?.[column + dx]))
          text(c, x + column + dx, y + row + dy, char, ink)
    })
  }
  if (shadow) {
    draw(2, 1, BRAND_SHADOW, true)
    silhouette.forEach((row, dy) =>
      row.forEach((opaque, dx) => {
        if (opaque) text(c, x + dx, y + dy, ' ', COLORS.text, 1, COLORS.ground)
      })
    )
  }
  draw(0, 0, color)
  const [eyeX, eyeY] = size === 'large' ? [15, 8] : size === 'compact' ? [11, 5] : [4, 2]
  const blink =
    motion &&
    ((status === 'starting' && Math.floor(seconds * 4) % 4 === 2) ||
      ((status === 'welcome' || status === 'running') && seconds % 6 >= 5.65))
  const waking = shadow && status === 'welcome' && seconds < INTRO_WAKE_SECONDS
  const pupil = status === 'stopped' ? 'X' : waking ? introPupil(seconds, motion) : blink ? '-' : 'o'
  const sockets = size === 'large' || size === 'compact'
  if (sockets) {
    text(c, x + eyeX, y + eyeY - 1, size === 'large' ? '.-. .-.' : '.-..-.', color)
    text(c, x + eyeX, y + eyeY + 1, size === 'large' ? "'-' '-'" : "'-''-'", color)
  }
  text(c, x + eyeX, y + eyeY, size === 'large' ? `(${pupil}) (${pupil})` : `(${pupil})(${pupil})`, color)
  const pupilColor =
    status === 'stopped'
      ? BRAND_COLORS.stopped
      : status === 'running' || status === 'starting'
        ? BRAND_COLORS[status]
        : color
  for (const dx of [1, size === 'large' ? 5 : 4]) text(c, x + eyeX + dx, y + eyeY, pupil, pupilColor)
}
