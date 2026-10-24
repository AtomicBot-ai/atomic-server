import { expect, it } from 'vitest'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import { agentMark, agentColor, drawAgentLabel } from './agent-brand.js'
import { canvas, COLORS } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { drawAgentChoices } from './connection-art.js'
import type { ConnectionDraft } from '../../../contract/index.js'
it('gives every supported agent a brand-colored ASCII mark with a safe fallback', () => {
  for (const agent of CONNECTION_AGENTS) {
    expect(agentMark(agent.id)).not.toBe('[>]')
    expect(agentMark(agent.id)).toMatch(/^[ -~]+$/)
    expect(agentColor(agent.id)).toMatch(/^#[0-9a-f]{6}$/)
  }
  expect(agentMark('other')).toBe('[>]')
  expect(agentColor('other')).toBe(COLORS.muted)
  const c = canvas(40, 4)
  drawAgentLabel(c, 1, 1, 20, 'claude', 'Claude Code')
  expect(c.cells[1]![1]!.color).toBe('#d77757')
  expect(c.cells[1]![7]!.color).toBe(COLORS.text)
})
it('uses the same brand colors in the sidebar, overview and setup cards', () => {
  const frame = workspaceFrame(createWorkspace('server'), 140, 42, 0)
  for (const id of ['claude', 'codex']) {
    const mark = agentMark(id)
    const hits = frame.cells.flatMap((row) =>
      row.flatMap((cell, x) =>
        row
          .slice(x, x + mark.length)
          .map((c) => c.char)
          .join('') === mark
          ? [cell]
          : []
      )
    )
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.every((cell) => cell.color === agentColor(id))).toBe(true)
  }
  const choices = canvas(120, 36)
  drawAgentChoices(choices, { more: true } as ConnectionDraft, 4, 5, 110, 30, '', 0)
  expect(choices.cells.flat().some((cell) => cell.color === agentColor('claude'))).toBe(true)
  expect(choices.cells.flat().some((cell) => cell.color === agentColor('codex'))).toBe(true)
})
