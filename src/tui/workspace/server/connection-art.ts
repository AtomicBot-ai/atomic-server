import { agentMark, agentColor, drawAgentLabel } from './agent-brand.js'
import { agentChoiceRows } from './connection-agent-list.js'
import { connectionIllustration } from './connection-illustrations.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { quietButton } from '../draw/controls.js'
import type { ConnectionDraft } from '../../../contract/index.js'

type Choice = 'agent' | 'endpoint' | 'manual'
const MANUAL = [
  [' \\ | / ', ' -(@)- ', ' / | \\ '],
  [' .\\|/. ', ' =(@)= ', " '/|\\' "],
  [' _ | _ ', ' ~(@)~ ', ' - | - '],
  [' .\\|/. ', ' =(@)= ', " '/|\\' "],
]
function titleLines(value: string, width: number): string[] {
  const lines: string[] = []
  for (const word of value.split(' ')) {
    const last = lines.at(-1)
    if (last && last.length + word.length + 1 <= width) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(...wrap(word, width))
  }
  return lines
}
export { agentMark } from './agent-brand.js'
export function connectionArt(choice: Choice, seconds: number, compact = true): string[] {
  if (choice !== 'manual') return connectionIllustration(choice, seconds, compact)
  return MANUAL[Math.floor(Math.max(0, seconds) * 2) % MANUAL.length]!
}

export function drawConnectionChoices(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number,
  onboarding = false
) {
  const guideChoices = [
    {
      id: 'guide-path:agent',
      kind: 'agent',
      title: 'Configure an agent',
      detail: 'Connect a coding assistant',
    },
    {
      id: 'guide-path:endpoint',
      kind: 'endpoint',
      title: 'Configure an endpoint',
      detail: 'Serve an API for your app',
    },
  ] as const
  const choices = onboarding
    ? [
        {
          ...guideChoices[1],
          id: 'first-connect:endpoint',
          detail: 'Choose a host, port, and API key.',
        },
        {
          ...guideChoices[0],
          id: 'first-connect:agent',
          title: 'Connect an agent',
          detail: 'Use Claude Code, Codex CLI, or another tool.',
        },
      ]
    : guideChoices
  const columns = width >= 66 ? 2 : 1
  const cardWidth = columns === 2 ? Math.floor((width - 2) / 2) : width
  const height = columns === 2 ? Math.min(10, bottom - y - 2) : Math.min(5, Math.floor((bottom - y - 2) / 2))
  choices.forEach((choice, i) => {
    const left = x + (columns === 2 ? i * (cardWidth + 2) : 0)
    const top = y + (columns === 2 ? 0 : i * height)
    const active = focus === choice.id
    const full = height >= 10 && columns === 2
    const art = connectionArt(choice.kind, seconds, !full)
    panel(c, left, top, cardWidth, height, active, seconds)
    if (height >= 7 && columns === 2) {
      art.forEach((line, row) => {
        const start = left + Math.floor((cardWidth - line.length) / 2)
        for (const [column, char] of [...line].entries())
          text(c, start + column, top + 1 + row, char, /[o*]/.test(char) ? COLORS.gold : COLORS.text)
      })
      titleLines(choice.title, cardWidth - 4)
        .slice(0, full ? 1 : 2)
        .forEach((line, row) =>
          text(c, left + 2, top + (full ? 7 : 5) + row, line, COLORS.text, cardWidth - 4, undefined, true)
        )
      titleLines(choice.detail, cardWidth - 4)
        .slice(0, Math.max(0, height - (full ? 9 : 8)))
        .forEach((line, row) =>
          text(c, left + 2, top + (full ? 8 : 7) + row, line, COLORS.muted, cardWidth - 4)
        )
    } else if (height >= 5) {
      art.forEach((line, row) => {
        for (const [column, char] of [...line].entries())
          text(c, left + 2 + column, top + 1 + row, char, /[o*]/.test(char) ? COLORS.gold : COLORS.text)
      })
      titleLines(choice.title, cardWidth - 15)
        .slice(0, 2)
        .forEach((line, row) =>
          text(c, left + 13, top + 1 + row, line, COLORS.text, cardWidth - 15, undefined, true)
        )
      if (height >= 6) text(c, left + 13, top + 4, choice.detail, COLORS.muted, cardWidth - 15)
    } else
      text(
        c,
        left + 2,
        top + 1,
        `${art[1]!.trim()}  ${choice.title}`,
        COLORS.text,
        cardWidth - 4,
        undefined,
        true
      )
    c.targets.push({ id: choice.id, x: left, y: top, width: cardWidth, height, hint: choice.detail })
  })
  if (!onboarding)
    quietButton(
      c,
      'guide-manual',
      x,
      Math.min(bottom, y + (columns === 2 ? height : height * 2) + 1),
      "I'll set it up myself",
      'Open the server workspace',
      focus
    )
}

export function drawAgentChoices(
  c: Canvas,
  d: ConnectionDraft,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number
) {
  const available = bottom - y + 1
  const { rows, columns } = agentChoiceRows(d, width, available)
  const selected = rows.findIndex((row) =>
    row.agents.length
      ? row.agents.some((agent) => focus === `guide-select:${agent.id}`)
      : focus === 'guide-more'
  )
  let start = 0
  while (
    start < selected &&
    rows.slice(start, selected + 1).reduce((n, row) => n + row.height, 0) > available
  )
    start++
  const cardWidth = Math.floor((width - (columns - 1) * 2) / columns)
  let top = y,
    end = start
  for (const row of rows.slice(start)) {
    if (top + row.height > bottom + 1) break
    if (!row.agents.length) {
      button(
        c,
        'guide-more',
        x,
        top,
        d.more ? 'Fewer agents' : 'More agents & tools',
        'Show supported agents and editors',
        focus
      )
    } else
      row.agents.forEach((agent, i) => {
        const left = x + i * (cardWidth + 2),
          id = `guide-select:${agent.id}`
        panel(c, left, top, cardWidth, row.height, focus === id, seconds)
        if (row.height > 3) {
          text(
            c,
            left + 2,
            top + 1,
            agentMark(agent.id),
            agentColor(agent.id),
            cardWidth - 4,
            undefined,
            true
          )
          text(c, left + 2, top + 3, agent.label, COLORS.text, cardWidth - 4, undefined, true)
        } else {
          if (cardWidth < 28) text(c, left + 2, top, agentMark(agent.id), agentColor(agent.id), cardWidth - 4)
          if (cardWidth < 28)
            text(c, left + 2, top + 1, agent.label, COLORS.text, cardWidth - 4, undefined, true)
          else drawAgentLabel(c, left + 2, top + 1, cardWidth - 4, agent.id, agent.label, COLORS.text, true)
        }
        c.targets.push({
          id,
          x: left,
          y: top,
          width: cardWidth,
          height: row.height,
          hint: `Connect ${agent.label}`,
        })
      })
    top += row.height
    end++
  }
  if (start > 0) text(c, x + width - 1, y, '↑', COLORS.gold, 1)
  if (end < rows.length) text(c, x + width - 1, bottom, '↓', COLORS.gold, 1)
}
