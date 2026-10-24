import { expect, it, vi } from 'vitest'
import { workspaceFrame } from './frame.js'
import { createWorkspace } from './state.js'
import { drawRail } from './sidebar.js'
import { drawSidebarControl } from './server/sidebar-control.js'
import { brandHeaderRows } from './draw/brand-header.js'
import { canvas, COLORS } from './draw/canvas.js'
import { SUPPORT_LINKS } from './support.js'
import { activate } from './actions.js'
import type { ActionContext } from './actions.js'
import type { WorkspaceController } from './controller.js'

it.each([32, 40])('keeps two-line navigation controls spaced and ordered at %i rows', (height) => {
  const c = canvas(90, height),
    s = createWorkspace('server')
  drawRail(c, s, height - 4, '')
  expect(c.targets.map((t) => t.id)).toEqual([
    'page:server',
    'page:chat',
    'page:models',
    'help',
    'open-admin',
    'page:access',
  ])
  c.targets.forEach((t, i) => {
    expect(t.height).toBe(2)
    expect(t.width).toBeGreaterThanOrEqual(10)
    if (i) expect(t.y).toBeGreaterThan(c.targets[i - 1]!.y + 1)
    expect(t.y + t.height).toBeLessThan(height - 2)
  })
  expect(c.targets[0]!.y).toBe(brandHeaderRows(c.width, c.height) + 1)
  expect(c.targets.at(-1)!.y + 2).toBe(height - 4)
  for (const i of [1, 2, 4, 5]) expect(c.targets[i]!.y - c.targets[i - 1]!.y).toBe(3)
  for (const target of c.targets.filter((t) => t.id !== 'page:server')) {
    expect(c.cells[target.y]![1]!.background).toBe(COLORS.navButton)
    expect(c.cells[target.y]![0]!.color).toBe(COLORS.navEdge)
  }
  const playground = c.targets[1]!
  expect(
    c.cells[playground.y + 1]!.slice(1, 12)
      .map((cell) => cell.char)
      .join('')
  ).toContain('Playground')
})
it('groups power, engine, model and connections and keeps their hit targets inside one surface', () => {
  const frame = workspaceFrame(createWorkspace('server'), 120, 40, 0)
  const controls = [
    'api-toggle',
    'server-model-page:engine',
    'server-model-page:model',
    'server-section:connect',
  ].map((id) => frame.targets.find((t) => t.id === id)!)
  expect(controls.every(Boolean)).toBe(true)
  expect(new Set(controls.map((c) => c.x)).size).toBe(1)
  expect(controls.at(-1)!.y - controls[0]!.y).toBeLessThan(10)
})
it('opens only the selected support destination with the system launcher', async () => {
  let state = { ...createWorkspace('server'), setupComplete: true }
  const run = vi.fn(async () => undefined)
  const context = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { run } as unknown as WorkspaceController,
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
  } satisfies ActionContext
  await activate('help', context)
  const frame = workspaceFrame(state, 90, 32, 0)
  expect(frame.popover?.height).toBe(13)
  expect(frame.targets.some((t) => t.id === 'support:discord')).toBe(true)
  for (const link of SUPPORT_LINKS) {
    await activate(link.id, context)
    expect(run).toHaveBeenLastCalledWith({ name: 'open-url', url: link.url })
  }
})

it.each([false, true])('keeps the focused server button readable when running=%s', (running) => {
  const s = createWorkspace('server')
  s.workspace = { api: { running }, services: [] } as never
  const c = canvas(80, 30)
  drawSidebarControl(c, s, 2, 3, 'api-toggle')
  const labels = c.cells.flat().filter((cell) => cell.background === COLORS.composer && cell.char.trim())
  expect(labels.length).toBeGreaterThan(5)
  expect(labels.every((cell) => cell.color === COLORS.ground)).toBe(true)
})
