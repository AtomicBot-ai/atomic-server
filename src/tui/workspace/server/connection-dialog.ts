/** Center the desktop connection dialog, reserving only the space its current step needs. */
import type { Canvas } from '../draw/canvas.js'
import { wrapWords } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import type { ConnectionDraft } from '../../../contract/index.js'

export function connectionDialog(c: Canvas, d: ConnectionDraft, downloading: boolean) {
  const width = Math.min(76, c.width - 8)
  const progress = downloading ? (width >= 64 ? 4 : 7) : 1
  const desired =
    progress +
    (d.step === 'review'
      ? 15 + Math.min(5, wrapWords(d.error, width).length) + (!d.model ? 2 : 0)
      : d.step === 'done'
        ? 16 + Math.min(4, wrapWords(d.command, width).length)
        : d.step === 'agent'
          ? d.more
            ? 26
            : 15
          : d.step === 'choose'
            ? 18
            : d.step === 'endpoint'
              ? 12
              : 8)
  const height = c.height < 30 ? c.height - 5 : Math.min(c.height - 5, desired)
  const left = Math.floor((c.width - width - 4) / 2)
  const top = Math.max(2, Math.floor((c.height - 3 - height) / 2))
  c.targets = []
  panel(c, left, top, width + 4, height)
  c.popover = { x: left, y: top, width: width + 4, height }
  return { x: left + 2, y: top + 1, width, bottom: top + height - 2 }
}
