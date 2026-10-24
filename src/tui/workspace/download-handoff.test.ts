import { expect, it } from 'vitest'
import type { ModelSetup } from '../../contract/index.js'
import { newSetup } from '../../terminal-setup/index.js'
import { createWorkspace } from './state.js'
import { workspaceDownloadRows } from './download-layout.js'
import { workspaceFrame } from './frame.js'

const model = {
  setup_id: 'model-job',
  request_id: 'chosen-model',
  stage: 'downloading_model',
  updated_at: 2,
  plan: { model_id: 'Qwen 4B', total_download_bytes: 1000 },
  task_ids: { model: 'model-transfer' },
} as unknown as ModelSetup
const engine = {
  id: 'engine',
  kind: 'engine',
  name: 'llama.cpp',
  stage: 'downloading',
  total: 100,
  transferred: 50,
}
const shown = (state: ReturnType<typeof createWorkspace>) =>
  workspaceFrame(state, 90, 32, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')
function state() {
  const s = createWorkspace('welcome')
  s.firstRun = 'permissions'
  s.workspace = { setups: [], downloads: [engine] } as never
  s.setup = { ...newSetup('server'), stage: 'download', repository: 'Qwen 4B', preparing: true, startedAt: 1 }
  return s
}

it('keeps the selected model in the same header while planning outlasts the engine download', () => {
  const s = state()
  expect(workspaceDownloadRows(s).map((row) => row['name'] ?? row['model_id'])).toEqual([
    'llama.cpp',
    'Qwen 4B',
  ])
  expect(shown(s)).toContain('+1 more')
  s.workspace = { setups: [], downloads: [{ ...engine, stage: 'ready' }] } as never
  expect(shown(s)).toContain('Qwen 4B')
  expect(shown(s)).toContain('preparing')
  const frame = workspaceFrame(s, 90, 32, 0)
  expect(frame.targets.some((target) => target.id === 'first-downloads')).toBe(true)
  expect(frame.targets.some((target) => target.id.startsWith('download-pause:'))).toBe(false)
})

it('hands off to the accepted job from setup polling before the next workspace refresh', () => {
  const s = state()
  s.setup!.preparing = false
  s.setup!.progress = {
    jobs: [model],
    transfers: [{ taskId: 'model-transfer', total: 1000, transferred: 250 }],
    ready: false,
  } as never
  expect(workspaceDownloadRows(s).map((row) => row.id)).toEqual(['model-job', 'engine'])
  s.workspace = { setups: [], downloads: [] } as never
  expect(shown(s)).toContain('Qwen 4B')
  expect(shown(s)).toContain('25%')
  expect(workspaceDownloadRows(s)).toHaveLength(1)
  s.workspace = { setups: [{ ...model, stage: 'ready', updated_at: 3 }], downloads: [] } as never
  s.setup!.selections = [{ requestId: model.request_id, plan: model.plan }] as never
  expect(workspaceDownloadRows(s)).toEqual([])
})

it('does not reintroduce a finished managed model from the local path record', () => {
  const s = state()
  s.setup!.path = { job: { id: 'managed-model', model: 'Qwen 4B' } } as never
  s.workspace = { setups: [{ id: 'managed-model', stage: 'ready' }], downloads: [] } as never
  expect(workspaceDownloadRows(s)).toEqual([])
})
