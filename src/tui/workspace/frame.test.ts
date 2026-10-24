import { describe, expect, it } from 'vitest'
import { drawEye, gateRows, gazeAt, ORNAMENT_STYLES } from './draw/art.js'
import { canvas, button, hit, text, textWidth, cleanText, wrap, art, rule, graphemes } from './draw/canvas.js'
import { workspaceFrame } from './frame.js'
import { workspaceLayout } from './draw/layout.js'
import { createWorkspace } from './state.js'
import type { Page } from './state.js'
const pages: Page[] = [
  'welcome',
  'history',
  'keys',
  'chat',
  'server',
  'models',
  'settings',
  'requests',
  'access',
  'logs',
  'checks',
  'commands',
]
describe('responsive terminal artwork and layout', () => {
  it.each([
    [54, 24],
    [80, 24],
    [120, 36],
    [180, 56],
    [240, 70],
  ])('fits every screen in %ix%i and keeps mouse targets visible', (w, h) => {
    for (const page of pages) {
      const s = createWorkspace(page),
        f = workspaceFrame(s, w, h, 3)
      expect(f.cells).toHaveLength(h)
      for (const row of f.cells) expect(textWidth(row.map((c) => c.char).join(''))).toBe(w)
      for (const t of f.targets) {
        expect(t.hint.length).toBeGreaterThan(0)
        expect(t.x + t.width).toBeLessThanOrEqual(w)
        expect(t.y + t.height).toBeLessThanOrEqual(t.y === h - 1 ? h : h - 3)
      }
    }
  })
  it('changes density by both height and width; reduced motion is deterministic', () => {
    expect(workspaceLayout(180, 24).tier).toBe('compact')
    expect(workspaceLayout(120, 36).tier).toBe('standard')
    expect(workspaceLayout(180, 56).tier).toBe('wide')
    expect(drawEye(120, 24, 0, false)).toEqual(drawEye(120, 24, 900, false))
    expect(gazeAt(0, true)).toEqual(gazeAt(1, true))
    expect(drawEye(120, 24, 0, true)).not.toEqual(drawEye(120, 24, 1, true))
    expect(gazeAt(0, true)).not.toEqual(gazeAt(12, true))
    for (const style of ORNAMENT_STYLES)
      for (const height of [1, 2, 5, 8])
        for (const width of [54, 120, 180]) {
          const g = gateRows(width, height, style)
          expect(g).toHaveLength(height)
          g.forEach((r) => expect(r.length).toBe(width))
        }
  })
  it('keeps overlay controls separate from hidden controls', () => {
    const s = createWorkspace('chat')
    s.overlay = 'stop'
    const f = workspaceFrame(s, 80, 24, 0)
    expect(f.targets.filter((t) => t.y < f.height - 1).map((t) => t.id)).toEqual(['stop-confirm'])
    const c = f.targets.find((t) => t.id === 'close')!
    expect(c.y).toBe(f.height - 1)
    expect(f.targets.filter((t) => t.id === 'close')).toHaveLength(1)
    expect(hit(f, c.x, c.y)?.id).toBe('close')
  })
  it.each([
    [54, 24],
    [120, 36],
    [180, 56],
  ])('dims the workspace behind a compact API confirmation at %sx%s', (width, height) => {
    const s = createWorkspace('server')
    s.setupComplete = true
    s.overlay = 'stop'
    const f = workspaceFrame(s, width, height, 0)
    const body = f.cells
      .slice(2, height - 3)
      .map((row) => row.map((cell) => cell.char).join(''))
      .join('\n')
    expect(body).toContain('Stop accepting API requests?')
    const original = workspaceFrame({ ...s, overlay: null }, width, height, 0)
    const bounds = f.popover!
    let preserved = 0
    for (let y = 0; y < height - 3; y++)
      for (let x = 0; x < width; x++) {
        if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height)
          continue
        const cell = f.cells[y]![x]!,
          source = original.cells[y]![x]!
        expect(cell.char).toBe(source.char)
        if (cell.char.trim()) {
          preserved++
          expect(cell.color).not.toBe(source.color)
        }
      }
    expect(preserved).toBeGreaterThan(0)
    const confirm = f.targets.find((target) => target.id === 'stop-confirm')!
    expect(confirm.height).toBe(3)
    expect(hit(f, confirm.x + 1, confirm.y + 1)?.id).toBe('stop-confirm')
    expect(f.targets.filter((target) => target.id === 'close')).toHaveLength(1)
    expect(f.targets.find((target) => target.id === 'close')?.y).toBe(height - 1)
  })
  it('clips Unicode text, strips terminal control codes, and shares hit geometry', () => {
    const c = canvas(12, 4)
    text(c, 0, 0, '界👁é')
    expect(graphemes('é👁')).toHaveLength(2)
    expect(textWidth('界👁é')).toBe(5)
    expect(wrap('世界abc', 4)).toEqual(['世界', 'abc'])
    expect(cleanText('\u001b[31mred\u001b[0m\u0007')).toBe('red')
    button(c, 'x', 2, 2, 'Go', 'hint')
    expect(hit(c, 3, 2)?.id).toBe('x')
    expect(hit(c, 0, 2)).toBeUndefined()
    art(c, 0, 0, drawEye(12, 3, 0, false))
    rule(c, 0, 3, 12)
    expect(c.cells[3]?.map((v) => v.char).join('')).toBe('------------')
  })
})

it('makes onboarding actions clickable and highlights the focused action', () => {
  const normal = workspaceFrame(createWorkspace('welcome'), 120, 36, 0)
  const start = normal.targets.find((t) => t.id === 'first-skip')!
  expect(hit(normal, start.x + 1, start.y)?.id).toBe('first-skip')
  expect(normal.targets.some((t) => t.id === 'first-skip')).toBe(true)
  const hovered = workspaceFrame({ ...createWorkspace('welcome'), hover: 'first-skip' }, 120, 36, 0)
  const skip = hovered.targets.find((t) => t.id === 'first-skip')!
  expect(hovered.cells[skip.y]![skip.x]!.background).not.toBe(normal.cells[skip.y]![skip.x]!.background)
})
