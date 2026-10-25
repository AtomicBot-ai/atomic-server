import { expect, it } from 'vitest'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { hit } from '../draw/canvas.js'

function fixture(step = 'review'): WorkspaceState {
  return {
    ...createWorkspace('server'),
    setupComplete: true,
    overlay: 'connection-guide',
    focus: 'guide-configure',
    installed: [{ id: 'chosen', name: 'Chosen model', provider: 'llamacpp-upstream' }],
    workspace: { api: { running: false, port: 1337 }, setups: [], downloads: [] } as never,
    connection: {
      step,
      path: 'agent',
      agent: 'codex',
      model: 'chosen',
      provider: 'llamacpp-upstream',
      port: '1337',
      more: false,
      agentPage: 0,
      error: '',
      status: '',
      command: '',
      endpoint: '',
      keyId: '',
    } as WorkspaceState['connection'],
  }
}
it.each([
  [54, 24],
  [120, 36],
])('preserves and dims the underlying workspace around the connection dialog at %s×%s', (width, height) => {
  const state = fixture()
  const frame = workspaceFrame(state, width!, height!, 0)
  const underlying = workspaceFrame({ ...state, overlay: null }, width!, height!, 0)
  const dialog = frame.popover!
  expect(dialog).toBeDefined()
  for (let y = 2; y < height! - 2; y++)
    for (let x = 0; x < width!; x++)
      if (x < dialog.x || x >= dialog.x + dialog.width || y < dialog.y || y >= dialog.y + dialog.height) {
        const cell = frame.cells[y]![x]!,
          original = underlying.cells[y]![x]!
        expect(cell.char, `${x},${y}`).toBe(original.char)
        expect(cell.color.slice(1, 3)).toBe(cell.color.slice(3, 5))
        expect(cell.color.slice(3, 5)).toBe(cell.color.slice(5, 7))
      }
  expect(frame.cells[dialog.y]![dialog.x]!.char).toBe('+')
  expect(frame.cells[dialog.y + dialog.height - 1]![dialog.x + dialog.width - 1]!.char).toBe('+')
  const primary = frame.targets.find((t) => t.id === 'guide-configure')!
  expect(primary.x + primary.width).toBe(dialog.x + dialog.width - 2)
  expect(hit(frame, primary.x, primary.y)?.id).toBe(primary.id)
})
it('pairs engine and model fields in a compact centered wide-screen review', () => {
  const frame = workspaceFrame(fixture(), 120, 36, 0)
  expect(frame.popover!.width).toBeLessThanOrEqual(80)
  expect(frame.popover!.height).toBeLessThanOrEqual(17)
  const engine = frame.targets.find((t) => t.id === 'guide-engine')!
  const model = frame.targets.find((t) => t.id === 'guide-model')!
  expect(engine.y).toBe(model.y)
  expect(engine.x + engine.width).toBeLessThan(model.x)
  const primary = frame.targets.find((t) => t.id === 'guide-configure')!
  expect(primary.y - engine.y).toBeLessThan(10)
})
it.each(['choose', 'agent', 'endpoint', 'review', 'preparing', 'done'])(
  'keeps every %s control inside its dialog',
  (step) => {
    for (const [width, height] of [
      [54, 24],
      [120, 36],
    ]) {
      const frame = workspaceFrame(fixture(step), width!, height!, 0)
      const dialog = frame.popover!
      for (const target of frame.targets.filter((t) => t.y < height! - 2)) {
        expect(target.x).toBeGreaterThan(dialog.x)
        expect(target.x + target.width).toBeLessThan(dialog.x + dialog.width)
        expect(target.y).toBeGreaterThan(dialog.y)
        expect(target.y + target.height).toBeLessThan(dialog.y + dialog.height)
      }
    }
  }
)
