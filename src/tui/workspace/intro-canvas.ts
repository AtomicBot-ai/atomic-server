import { engineName, engineProgress, formatSize } from '../../workspace-view/index.js'
import type { DownloadProgress } from '@atomic-chat/core/contracts'
import { drawIntroBrand } from './draw/brand-intro.js'
import { canvas, COLORS, text } from './draw/canvas.js'
import { actionButton, panel } from './draw/cards.js'

export function introCanvas(
  width: number,
  height: number,
  seconds: number,
  motion: boolean,
  prompt: string,
  download?: { name: string; progress: DownloadProgress | null }
) {
  const c = canvas(width, height)
  const actionable = prompt === 'Press any key' || prompt === 'Choose engine'
  drawIntroBrand(c, seconds, motion, prompt)
  if (actionable) {
    const row = height - 4
    text(c, 6, row, ' '.repeat(Math.max(0, width - 12)), COLORS.text)
  }
  if (download) {
    const size = Math.max(8, Math.min(62, width - 4)),
      x = Math.floor((width - size) / 2)
    const y = Math.max(0, height - 7)
    panel(c, x, y, size, 5)
    const p = engineProgress(download.progress ? [download.progress] : [], download.progress?.taskId ?? '')
    text(c, x + 2, y + 1, engineName(download.name), COLORS.text, size - 4, undefined, true)
    const length = Math.max(1, size - 13)
    const done = Math.round((length * (p.percent ?? 0)) / 100)
    const track =
      p.percent === null
        ? Array.from({ length }, (_, i) =>
            Math.abs(i - (Math.floor((motion ? seconds : 0) * 5) % length)) < 2 ? '=' : '.'
          ).join('')
        : '='.repeat(done) + '.'.repeat(length - done)
    text(c, x + 2, y + 2, `[${track}]${p.percent === null ? '' : ` ${p.percent}%`}`, COLORS.gold, size - 4)
    text(
      c,
      x + 2,
      y + 3,
      `${p.status}${p.total ? ` · ${formatSize(p.transferred)} / ${formatSize(p.total)}` : '...'}`,
      COLORS.muted,
      size - 4
    )
  } else if (actionable) {
    const size = Math.min(width - 2, prompt.length + 6)
    actionButton(c, 'intro-continue', Math.floor((width - size) / 2), Math.max(0, height - 5), prompt, prompt)
  }
  return c
}
