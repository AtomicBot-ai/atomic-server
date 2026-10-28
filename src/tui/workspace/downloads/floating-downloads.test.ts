import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { drawFloatingDownloads } from './floating-downloads.js'

// E2E B02: the shared card said "cancelled" for a download paused from either client.
it('calls a paused download Paused on the shared card', () => {
  const s = {
    ...createWorkspace('server'),
    workspace: {
      setups: [{ id: 'job', stage: 'cancelled', plan: { model_id: 'Model', total_download_bytes: 100 } }],
      downloads: [],
    } as unknown as WorkspaceSnapshot,
  } as WorkspaceState
  const c = canvas(80, 12)
  drawFloatingDownloads(c, s, '', false, { x: 0, y: 0, width: 60, height: 6 })
  const text = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(text).toContain('Paused')
  expect(text).not.toContain('cancelled')
})
