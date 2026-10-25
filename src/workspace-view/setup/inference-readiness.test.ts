import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { inferenceReadiness, setupModelPending } from './inference-readiness.js'
const snapshot = (over: Partial<WorkspaceSnapshot> = {}) =>
  ({
    services: [],
    setups: [],
    downloads: [],
    loads: [],
    api: { running: false },
    ...over,
  }) as WorkspaceSnapshot
const job = (stage: string, category = 'text') => ({
  id: 'q',
  stage,
  plan: { model_id: 'qwen', category, total_download_bytes: 100 },
})
const service = {
  id: 'q',
  model: 'qwen',
  provider: 'llamacpp-upstream',
  kind: 'chat' as const,
  state: 'ready',
  details: {},
}
it('never treats a management daemon, downloaded file or different model session as inference readiness', () => {
  expect(inferenceReadiness(snapshot())).toMatchObject({ ready: false, waiting: false, acquire: 'catalog' })
  expect(inferenceReadiness(snapshot({ setups: [job('ready')] }))).toMatchObject({
    ready: false,
    message: 'Load the downloaded model to continue.',
  })
  expect(inferenceReadiness(snapshot({ services: [service] }), { model: 'other' }).ready).toBe(false)
  expect(inferenceReadiness(snapshot({ services: [service] })).ready).toBe(true)
  expect(inferenceReadiness(snapshot({ services: [service] }), { requireApi: true })).toMatchObject({
    ready: false,
    acquire: 'server',
  })
})
it.each(['downloading', 'downloading_model', 'downloading_engine'])(
  'keeps %s pending and directs a stopped download to recovery',
  (stage) => {
    expect(inferenceReadiness(snapshot({ setups: [job(stage)] }))).toMatchObject({
      ready: false,
      waiting: true,
      acquire: 'downloads',
    })
    expect(inferenceReadiness(snapshot({ setups: [job('paused')] }))).toMatchObject({
      ready: false,
      waiting: false,
      message: 'Resume the model download to continue.',
    })
  }
)
it('waits only for the text model chosen in onboarding and recognizes every completed status', () => {
  expect(setupModelPending(snapshot({ setups: [job('downloading', 'image')] }))).toBe(false)
  expect(setupModelPending(snapshot({ setups: [job('paused')] }), 'qwen')).toBe(true)
  for (const stage of ['ready', 'completed', 'succeeded', 'done'])
    expect(setupModelPending(snapshot({ setups: [job(stage)] }))).toBe(false)
})
it('ignores an engine download that is not the model’s own when the model is named', () => {
  const failedEngine = {
    taskId: 'e1',
    kind: 'engine',
    engine: 'mlx',
    stage: 'failed',
    state: 'failed',
    transferred: 0,
    total: 0,
  }
  // A model that is not downloading at all: the stale engine job says nothing about it.
  expect(
    inferenceReadiness(snapshot({ downloads: [failedEngine] }), { model: 'qwen', kind: 'chat' })
  ).toMatchObject({
    message: 'Choose and download a model to continue.',
    acquire: 'catalog',
  })
  // A model whose own setup waits on that engine shows the setup's own stage (the transfer folds into it).
  const waiting = { ...job('installing_engine'), task_ids: { engine: 'e1', model: 'q' } }
  expect(
    inferenceReadiness(snapshot({ setups: [waiting], downloads: [failedEngine] }), { model: 'qwen' })
  ).toMatchObject({ message: 'The engine is downloading. Wait until it is ready.', acquire: 'downloads' })
  // No model named (the API start): any engine download still counts.
  expect(inferenceReadiness(snapshot({ downloads: [failedEngine] }))).toMatchObject({
    message: 'Retry the engine download to continue.',
  })
})
