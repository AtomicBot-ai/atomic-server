import type { Canvas } from '../draw/canvas.js'
import { COLORS, text, wrapWords } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { workspaceDownloadRows } from '../download-layout.js'
import { drawFloatingDownloads } from '../floating-downloads.js'
import { agentColor, agentMark } from './agent-brand.js'
import { connectionAgentName } from './connection-guide-actions.js'

export function drawConnectionHeading(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const d = s.connection!,
    name = connectionAgentName(d.agent)
  const chosen = ['review', 'preparing', 'done'].includes(d.step)
  const title =
    d.step === 'choose'
      ? 'What would you like to connect?'
      : d.step === 'agent'
        ? 'Choose your agent'
        : d.step === 'endpoint'
          ? 'Create a local endpoint'
          : d.step === 'review'
            ? d.path === 'agent'
              ? `Connect ${name}`
              : 'Review your endpoint'
            : d.step === 'done'
              ? d.path === 'agent'
                ? `${name} connection is ready`
                : 'Your endpoint is ready'
              : 'Preparing your server'
  const pending = workspaceDownloadRows(s).length > 0
  const paired = pending && width >= 64
  const cardWidth = paired ? Math.min(38, width - 28) : width
  const titleWidth = paired ? width - cardWidth - 2 : width
  let row = y
  if (chosen && c.height >= 30) {
    text(
      c,
      x,
      row++,
      d.path === 'agent' ? agentMark(d.agent) : '((|))',
      d.path === 'agent' ? agentColor(d.agent) : COLORS.gold,
      titleWidth,
      undefined,
      true
    )
  }
  const prefix = chosen && c.height < 30 ? (d.path === 'agent' ? agentMark(d.agent) : '((|))') + ' ' : ''
  const lines = wrapWords(prefix + title, titleWidth)
  lines.forEach((line) => text(c, x, row++, line, COLORS.text, titleWidth, undefined, true))
  if (!pending) return row + 1
  const cardY = paired ? y : row + 1
  drawFloatingDownloads(c, s, focus, false, {
    x: paired ? x + width - cardWidth : x,
    y: cardY,
    width: cardWidth,
    height: 5,
  })
  return cardY + 6
}
