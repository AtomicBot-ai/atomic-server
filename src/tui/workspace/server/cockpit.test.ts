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
])('keeps media fields and cockpit controls accessible at %s by %s', (w, h) => {
  const s = {
    ...createWorkspace('tools'),
    setupComplete: true,
    operation: 'media.image.create',
    operations: [...WORKSPACE_OPERATIONS],
    focus: 'operation-field:request.strength',
  }
  const frame = workspaceFrame(s, w, h, 1)
  expect(frame.targets.some((t) => t.id === s.focus)).toBe(true)
  for (const id of ['api-toggle', 'api-ping', 'operation-run', 'operation-json', 'operation-down'])
    expect(frame.targets.some((t) => t.id === id)).toBe(true)
  for (const target of frame.targets) {
    expect(target.x + target.width).toBeLessThanOrEqual(w)
    expect(target.y + target.height).toBeLessThanOrEqual(h)
  }
})
