import { expect, it } from 'vitest'
import { Box, renderToString, type Key } from 'ink'
import { createWorkspace } from './state.js'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { shellLayout } from './navigation/shell-layout.js'
import { CanvasRow } from './draw/CanvasRow.js'
import { COLORS, hit } from './draw/canvas.js'

const state = () => ({
  ...createWorkspace('chat'),
  setupComplete: true,
  focus: 'composer',
  draft: 'Keep my draft',
  cursor: 13,
  model: 'organization/a-very-long-model-name-with-a-quantization-suffix-Q4_K_M',
  messages: [
    {
      role: 'assistant' as const,
      content: Array.from({ length: 30 }, (_, i) => `Transcript line ${i}`).join('\n'),
    },
  ],
})

it.each([
  [110, 32],
  [80, 24],
  [54, 20],
])('keeps the chat usable at %ix%i and preserves the draft across resize', (width, height) => {
  const s = state(),
    frame = workspaceFrame(s, width!, height!, 0)
  const composer = frame.targets.find((t) => t.id === 'composer')!
  const text = frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')
  expect(text).toContain('Keep my draft')
  expect(text).toContain('Model details')
  expect(frame.targets.some((t) => t.id === 'send')).toBe(true)
  expect(frame.cells[composer.y]![composer.x]!.background).toBe(COLORS.ground)
  if (width === 110)
    expect(text.split('\n').filter((line) => line.includes('Transcript line')).length).toBeGreaterThanOrEqual(
      12
    )
  if (width! < 110) expect(shellLayout(width!, height!).sidebar).toBe(0)
  if (width! < 90) {
    expect(shellLayout(width!, height!).rail).toBe(0)
    const nav = frame.targets.filter((t) => t.id.startsWith('page:'))
    expect(nav).toHaveLength(4)
    expect(new Set(nav.map((t) => t.y)).size).toBe(1)
  }
  for (const t of frame.targets) {
    expect(hit(frame, t.x, t.y)?.id, t.id).toBe(t.id)
    expect(t.x + t.width, t.id).toBeLessThanOrEqual(width!)
    expect(t.y + t.height, t.id).toBeLessThanOrEqual(height!)
  }
  const resized = workspaceFrame(s, 110, 32, 0)
  expect(
    resized.cells
      .flat()
      .map((c) => c.char)
      .join('')
  ).toContain(s.draft)
  expect(s.cursor).toBe(13)
})

it('uses the Web Alt map and visual Tab order on the compact navigation', () => {
  const s = state(),
    frame = workspaceFrame(s, 80, 24, 0)
  for (const [i, page] of ['server', 'chat', 'models', 'access'].entries())
    expect(workspaceInput(String(i + 1), { meta: true } as Key, s, frame).action).toBe(`page:${page}`)
  for (let i = 0; i < frame.targets.length; i++) {
    const focus = frame.targets[i]!.id
    expect(workspaceInput('', { tab: true } as Key, { ...s, focus }, frame).patch?.focus).toBe(
      frame.targets[(i + 1) % frame.targets.length]!.id
    )
  }
  expect(
    workspaceInput('', { rightArrow: true } as Key, { ...s, focus: 'page:chat' }, frame).patch?.focus
  ).toBe('page:models')
})

it.each([
  [false, false],
  [true, false],
  [true, true],
])('renders distinct selected/focus markers with color=%s trueColor=%s', (color, trueColor) => {
  const frame = workspaceFrame({ ...state(), focus: 'page:models' }, 80, 24, 0)
  const rendered = renderToString(
    <Box flexDirection="column">
      {frame.cells.map((cells, i) => (
        <CanvasRow key={i} cells={cells} color={color!} trueColor={trueColor!} />
      ))}
    </Box>,
    { columns: 80 }
  )
  expect(rendered).toContain('*2 Playground')
  expect(rendered).toContain('>3 Models')
  expect(rendered).toContain('Keep my draft')
})

it('visits every distinct action once even when Help is repeated in the rail and footer', () => {
  const s = state(),
    frame = workspaceFrame(s, 110, 32, 0)
  const expected = [...new Set(frame.targets.map((target) => target.id))]
  let focus = expected[0]!
  const visited: string[] = []
  for (let i = 0; i < expected.length; i++) {
    visited.push(focus)
    focus = workspaceInput('', { tab: true } as Key, { ...s, focus }, frame).patch!.focus!
  }
  expect(visited).toEqual(expected)
  expect(focus).toBe(expected[0])
  expect(visited).toContain('quit')
})

it('routes long diagnostic and model details through PageUp and PageDown', () => {
  const s = { ...state(), overlay: 'chat-detail' as const, focus: 'close' }
  const frame = workspaceFrame(s, 54, 20, 0)
  expect(workspaceInput('', { pageDown: true } as Key, s, frame).action).toBe('scroll-down')
  expect(workspaceInput('', { pageUp: true } as Key, s, frame).action).toBe('scroll-up')
})
