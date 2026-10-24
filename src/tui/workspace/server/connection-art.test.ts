import { expect, it } from 'vitest'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import { canvas } from '../draw/canvas.js'
import { agentMark, connectionArt, drawAgentChoices, drawConnectionChoices } from './connection-art.js'
import type { ConnectionDraft } from '../../../contract/index.js'

it('animates each ASCII connection illustration without introducing terminal control characters', () => {
  for (const choice of ['agent', 'endpoint', 'manual'] as const) {
    const changed = choice === 'agent' ? 5 : choice === 'endpoint' ? 0.8 : 0.5
    const cycle = choice === 'agent' ? 5.4 : choice === 'endpoint' ? 2.5 : 2
    expect(connectionArt(choice, 0)).not.toEqual(connectionArt(choice, changed))
    expect(connectionArt(choice, cycle)).toEqual(connectionArt(choice, 0))
    expect(connectionArt(choice, 0).every((line) => /^[ -~]+$/.test(line))).toBe(true)
  }
  for (const agent of CONNECTION_AGENTS) expect(agentMark(agent.id)).not.toBe('[>]')
})
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [160, 50],
])('keeps every connection card and agent page inside the available area at %sx%s', (width, height) => {
  const c = canvas(width, height)
  const bottom = height - 10
  drawConnectionChoices(c, 4, 5, width - 8, bottom, 'guide-path:agent', 0.5)
  expect(c.targets.filter((t) => t.id.startsWith('guide-path:'))).toHaveLength(2)
  expect(c.targets.find((t) => t.id === 'guide-manual')?.height).toBe(1)
  for (const target of c.targets) {
    expect(target.height).toBeGreaterThanOrEqual(target.id === 'guide-manual' ? 1 : 3)
    expect(target.y + target.height).toBeLessThanOrEqual(bottom)
    expect(target.x + target.width).toBeLessThanOrEqual(width - 4)
  }
  for (const more of [false, true]) {
    const agents = canvas(width, height)
    drawAgentChoices(agents, { more, agentPage: 0 } as ConnectionDraft, 4, 5, width - 8, bottom, '', 0)
    for (const target of agents.targets) {
      expect(target.y + target.height).toBeLessThanOrEqual(bottom + 1)
      expect(target.x + target.width).toBeLessThanOrEqual(width - 4)
    }
  }
})
