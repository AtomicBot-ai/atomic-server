import type { Key } from 'ink'
import { expect, it } from 'vitest'
import { canvas } from './draw/canvas.js'
import { workspaceInput } from './input.js'
import { createWorkspace } from './state.js'
import { drawRail } from './sidebar.js'
import { RAIL_ITEMS, railInput } from './rail.js'

const key = (value: Partial<Key> = {}) => value as Key
const frame = (s: ReturnType<typeof createWorkspace>, width: number, height: number, top: number) => {
  const c = canvas(width, height)
  c.contentTop = top
  drawRail(c, s, height - 4, s.focus)
  return c
}

it.each([
  [54, 24, 12],
  [80, 24, 7],
  [90, 32, 7],
])('keeps every rail destination reachable at %i×%i with a %i-row header', (width, height, top) => {
  const s = createWorkspace('server')
  s.focus = RAIL_ITEMS[0].id
  for (const item of RAIL_ITEMS) {
    const c = frame(s, width, height, top)
    expect(s.focus).toBe(item.id)
    expect(c.targets.some((target) => target.id === item.id)).toBe(true)
    expect(workspaceInput('', key({ return: true }), s, c).action).toBe(item.id)
    c.targets.forEach((target, i) => {
      expect(target.height).toBe(2)
      expect(target.y).toBeGreaterThan(top)
      expect(target.y + target.height).toBeLessThanOrEqual(height - 4)
      if (i) expect(target.y).toBeGreaterThan(c.targets[i - 1]!.y + 2)
    })
    for (const y of [top, height - 4])
      expect(c.cells[y]!.slice(0, 13).every((cell) => !cell.char.trim())).toBe(true)
    const next = workspaceInput('', key({ downArrow: true }), s, c)
    expect(next.action).toBeUndefined()
    Object.assign(s, next.patch)
  }
  for (const item of [...RAIL_ITEMS].reverse()) {
    expect(s.focus).toBe(item.id)
    const c = frame(s, width, height, top)
    expect(c.targets.some((target) => target.id === item.id)).toBe(true)
    Object.assign(s, workspaceInput('', key({ upArrow: true }), s, c).patch)
  }
})

it('scrolls the rail under the mouse without navigating or scrolling the page content', () => {
  const s = createWorkspace('server')
  s.mouse = true
  s.focus = 'server-agent:0'
  for (let i = 0; i < 5; i++) {
    const c = frame(s, 54, 24, 12)
    const result = workspaceInput('[<65;5;15M', key(), s, c)
    expect(result.action).toBeUndefined()
    Object.assign(s, result.patch)
  }
  expect(s.focus).toBe('page:access')
  expect(s.page).toBe('server')
  const c = frame(s, 54, 24, 12)
  const target = c.targets.find((item) => item.id === 'page:access')!
  expect(workspaceInput(`[<0;5;${target.y + 1}M`, key(), s, c).action).toBe('page:access')
  expect(railInput('[<65;30;15M', key(), s, c)).toBeNull()
  s.overlay = 'help'
  expect(railInput('[<65;5;15M', key(), s, c)).toBeNull()
})
