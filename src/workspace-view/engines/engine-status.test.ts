import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { engineStatus } from './engine-status.js'

const installed = { engine: 'llamacpp-upstream', active: { version: 'b11946', variant: 'cpu' } }
const live = (over: Partial<WorkspaceSnapshot>) =>
  ({ downloads: [], engines: [], ...over }) as WorkspaceSnapshot

it.each([
  ['the active build', installed, null, 'Installed · b11946 · cpu'],
  [
    'an update the core offers',
    { ...installed, update: { needed: true, target: { version: 'b12000' } } },
    null,
    'Installed · b11946 · cpu · update b12000',
  ],
  ['builds with none active', { engine: 'mlx', builds: [{ version: '1' }] }, null, 'Installed'],
  ['nothing on disk', { engine: 'mlx' }, null, 'Not installed'],
  ['a source that failed', { engine: 'mlx', source_error: 'offline' }, null, 'Unavailable: offline'],
  [
    'a build downloading',
    { engine: 'llamacpp-upstream' },
    live({
      downloads: [
        { kind: 'engine', engine: 'llamacpp-upstream', stage: 'downloading', transferred: 40, total: 100 },
      ],
    }),
    'Installing · 40%',
  ],
  [
    'a build that failed to install',
    { engine: 'llamacpp-upstream' },
    live({
      downloads: [{ kind: 'engine', engine: 'llamacpp-upstream', stage: 'failed', transferred: 0, total: 0 }],
    }),
    'Install failed',
  ],
  [
    'a failed update beside the build that still runs',
    installed,
    live({
      downloads: [{ kind: 'engine', engine: 'llamacpp-upstream', stage: 'failed', transferred: 0, total: 0 }],
    }),
    'Installed · b11946 · cpu · install failed',
  ],
  [
    'a new install ahead of an older failure',
    installed,
    live({
      downloads: [
        { kind: 'engine', engine: 'llamacpp-upstream', stage: 'failed', updated_at: 1 },
        {
          kind: 'engine',
          engine: 'llamacpp-upstream',
          stage: 'downloading',
          updated_at: 2,
          transferred: 50,
          total: 100,
        },
      ],
    }),
    'Installing · 50%',
  ],
  [
    'a successful install after an older failure',
    installed,
    live({
      downloads: [
        { kind: 'engine', engine: 'llamacpp-upstream', stage: 'failed', updated_at: 1 },
        { kind: 'engine', engine: 'llamacpp-upstream', stage: 'ready', updated_at: 2 },
      ],
    }),
    'Installed · b11946 · cpu',
  ],
  [
    'a managed engine already installed',
    { engine: 'vllm' },
    live({
      engines: [
        {
          engine: 'vllm',
          installation: { status: 'ready', active_descriptor_id: 'vllm-2' },
          operation: null,
        },
      ] as unknown as WorkspaceSnapshot['engines'],
    }),
    'Installed · vllm-2',
  ],
  [
    'a managed engine being set up',
    { engine: 'vllm' },
    live({
      engines: [
        {
          engine: 'vllm',
          installation: null,
          operation: { phase: 'pulling-image', cancellation_requested: false, pending_host_step: null },
        },
      ] as unknown as WorkspaceSnapshot['engines'],
    }),
    'Downloading the engine image',
  ],
] as const)('says %s', (_, row, snapshot, status) => {
  expect(engineStatus(row, snapshot)).toBe(status)
})
