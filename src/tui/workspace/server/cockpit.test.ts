import { expect, it } from 'vitest'
import { cockpitStatus } from './cockpit.js'
import { drawEye } from '../draw/art.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
it('uses state-specific eye motion and preserves status when motion is reduced', () => {
  const s = createWorkspace('server')
  expect(cockpitStatus(s)).toBe('offline')
  expect(cockpitStatus({ ...s, busy: true, message: 'Starting API…' })).toBe('starting')
  const ready = drawEye(24, 8, 1, true, 'ready')
  expect(drawEye(24, 8, 1, true, 'starting')).not.toEqual(ready)
  expect(drawEye(24, 8, 1, true, 'overloaded')).not.toEqual(ready)
  expect(drawEye(24, 8, 1, false, 'overloaded')).toEqual(drawEye(24, 8, 99, false, 'overloaded'))
  expect(drawEye(24, 8, 1, false, 'offline')).not.toEqual(drawEye(24, 8, 1, false, 'ready'))
})
it.each([
  [54, 24],
  [100, 30],
  [160, 50],
])('keeps media fields and server controls accessible at %s by %s', (w, h) => {
  const s = {
    ...createWorkspace('tools'),
    setupComplete: true,
    operation: 'media.image.create',
    operations: [...WORKSPACE_OPERATIONS],
    focus: 'operation-field:request.strength',
  }
  const frame = workspaceFrame(s, w, h, 1)
  expect(frame.targets.some((t) => t.id === s.focus)).toBe(true)
  for (const id of ['api-toggle', 'operation-run', 'operation-json', 'operation-down'])
    expect(
      frame.targets.some((t) => t.id === id),
      id
    ).toBe(true)
  for (const target of frame.targets) {
    expect(target.x + target.width).toBeLessThanOrEqual(w)
    expect(target.y + target.height).toBeLessThanOrEqual(h)
  }
})

const screen = (frame: ReturnType<typeof workspaceFrame>) =>
  frame.cells.map((row) => row.map((c) => c.char).join('')).join('\n')

it('shows a privileged step the server waits on, with its command, and a running engine operation', async () => {
  const { operation } = await import('../../../../test/helpers/managed-fixtures.js')
  const s = { ...createWorkspace('server'), setupComplete: true }
  const waiting = operation('tensorrt-llm', 'preparing-host', {
    pending_host_step: { step_id: 's1' } as never,
  })
  s.workspace = {
    eye: 'ready',
    api: { running: true },
    services: [],
    metrics: {},
    engines: [
      { engine: 'tensorrt-llm', installation: null, operation: waiting },
      { engine: 'vllm', installation: null, operation: operation('vllm', 'pulling-image') },
    ],
    host_steps: [
      {
        step_id: 's1',
        operation_id: waiting.operation_id,
        instructions: 'sudo atc host-step exec /r/s1.json',
        updated_at: 1,
      },
    ],
    loads: [],
  } as never
  const text = screen(workspaceFrame(s, 160, 50, 0))
  expect(text).toContain('sudo atc host-step exec /r/s1.json')
  expect(text).toContain('vllm setup: Downloading the engine image')
})

it('shows the steps the daemon reported before the first snapshot', () => {
  const s = { ...createWorkspace('server'), setupComplete: true }
  s.base = {
    ...s.base,
    daemon: {
      kind: 'up',
      snapshot: { sessions: [], server: { running: false } } as never,
      record: undefined,
      pending: [{ step_id: 's2', instructions: 'sudo atc host-step exec /r/s2.json', updated_at: 1 }],
    },
  }
  expect(screen(workspaceFrame(s, 160, 50, 0))).toContain('sudo atc host-step exec /r/s2.json')
})
