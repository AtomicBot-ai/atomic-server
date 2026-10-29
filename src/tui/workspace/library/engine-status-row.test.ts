import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { libraryRows } from './library-model.js'

const screen = (s: ReturnType<typeof createWorkspace>, width: number, height: number) =>
  workspaceFrame(s, width, height, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')

// 0.2.7 retest B08: the list showed engine names only; the Web and the engine's details knew b11946.
it.each([
  [120, 36],
  [80, 24],
])('says what is installed in the engine list at %i×%i', (width, height) => {
  const state = {
    ...createWorkspace('models'),
    setupComplete: true,
    libraryView: 'engines' as const,
    libraryRows: libraryRows(
      {
        engines: [
          { engine: 'llamacpp-upstream', active: { version: 'b11946', variant: 'cpu' } },
          { engine: 'mlx' },
          { engine: 'vllm' },
        ],
      },
      'engines'
    ),
    workspace: {
      downloads: [],
      engines: [
        {
          engine: 'vllm',
          installation: null,
          operation: { phase: 'pulling-image', cancellation_requested: false, pending_host_step: null },
        },
      ],
    } as unknown as WorkspaceSnapshot,
  }
  const text = screen(state, width, height)
  expect(text).toContain('Installed · b11946')
  expect(text).toContain('Not installed')
  expect(text).toContain('Downloading the engine')
})
