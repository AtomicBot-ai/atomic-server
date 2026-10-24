import { expect, it } from 'vitest'
import { connectionDownload, connectionDownloadTarget, connectionModelState } from './connection-model.js'

const plan = { model_id: 'new-model', provider: 'llamacpp-upstream', total_download_bytes: 1000 }
const job = { id: 'job', stage: 'downloading_model', plan }

it('keeps the selected engine before a model is downloaded, using its matching plan', () => {
  expect(connectionModelState('new-model', [], [job], [{ taskId: 'job', transferred: 400 }])).toMatchObject({
    ready: false,
    waiting: true,
    provider: 'llamacpp-upstream',
    providers: ['llamacpp-upstream'],
    percent: 40,
    status: 'Waiting for the model download · 40%',
  })
  expect(connectionModelState('another', [], [job], [], 'mlx')).toMatchObject({
    provider: 'mlx',
    waiting: false,
  })
})

it.each([
  ['paused', 'Download paused. Resume it to continue.'],
  ['cancelled', 'Download paused. Resume it to continue.'],
  ['failed', 'Download failed. Resume it to retry.'],
  ['interrupted', 'Download failed. Resume it to retry.'],
  ['registering', 'Finishing model setup…'],
  ['ready', 'Finishing model setup…'],
])('reports %s without pretending the model is available', (stage, status) => {
  expect(connectionModelState('new-model', [], [{ ...job, stage }], [])).toMatchObject({
    ready: false,
    status,
  })
})

it('reports a removed download and preserves the chosen engine', () => {
  expect(connectionModelState('new-model', [], [], [], 'llamacpp-upstream')).toMatchObject({
    ready: false,
    waiting: false,
    provider: 'llamacpp-upstream',
    status: 'Model is not downloaded. Choose it again to start a download.',
  })
})

it('becomes ready from installation evidence and retains a compatible selected engine', () => {
  expect(
    connectionModelState(
      'new-model',
      [{ id: 'new-model', providers: ['vllm', 'tensorrt-llm'] }],
      [job],
      [],
      'tensorrt-llm'
    )
  ).toMatchObject({
    ready: true,
    waiting: false,
    provider: 'tensorrt-llm',
    status: 'Model ready. Configure the connection to continue.',
  })
})

it('does not attach another download’s progress to a finished model that is registering', () => {
  expect(
    connectionModelState(
      'new-model',
      [],
      [{ ...job, stage: 'ready' }],
      [{ taskId: 'other', state: 'downloading', transferred: 30, total: 100 }]
    )
  ).toMatchObject({ status: 'Finishing model setup…', percent: null })
})

it('reads managed and Foundry targets and skips optional media selections', () => {
  const managed = { kind: 'managed-model', plan: { repository: 'repo/model', engine: 'vllm' } }
  const foundry = { kind: 'foundry-model', plan: { model_id: 'Phi', variant_id: 'Phi/cpu' } }
  expect(connectionDownloadTarget(managed)).toEqual({ model: 'repo/model', provider: 'vllm' })
  expect(connectionDownloadTarget(foundry)).toEqual({ model: 'Phi/cpu', provider: 'foundry-local' })
  expect(connectionDownload([{ plan: { category: 'image', model_id: 'image' } }, managed])).toBe(managed)
  expect(connectionDownload([job, managed], 'repo/model')).toBe(managed)
})

it('follows the newer attempt through downloading, completion and installation instead of an old failure', () => {
  const failed = { ...job, id: 'old', stage: 'failed', created_at: 10, updated_at: 20 }
  const current = { ...job, id: 'new', created_at: 30, updated_at: 40 }
  for (const attempts of [
    [failed, current],
    [current, failed],
  ]) {
    expect(connectionDownload(attempts, 'new-model')).toBe(current)
    expect(
      connectionModelState('new-model', [], attempts, [{ taskId: 'new', transferred: 600 }])
    ).toMatchObject({
      ready: false,
      percent: 60,
      status: 'Waiting for the model download · 60%',
    })
    const ready = { ...current, stage: 'ready', updated_at: 50 }
    const completed = attempts.map((attempt) => (attempt.id === 'new' ? ready : attempt))
    expect(connectionDownload(completed, 'new-model')).toBe(ready)
    expect(connectionModelState('new-model', [], completed, [])).toMatchObject({
      status: 'Finishing model setup…',
    })
    expect(
      connectionModelState('new-model', [{ id: 'new-model', provider: 'llamacpp-upstream' }], completed, [])
    ).toMatchObject({ ready: true, waiting: false })
  }
})
it('prefers an appended picker response until its timestamped snapshot arrives', () => {
  const failed = { ...job, id: 'old', stage: 'failed', created_at: 10, updated_at: 20 }
  const pending = { ...job, id: 'pending' }
  expect(connectionDownload([failed, pending], 'new-model')).toBe(pending)
  expect(
    connectionDownload([failed, { ...pending, created_at: 30, updated_at: 30 }], 'new-model')?.['id']
  ).toBe('pending')
})
it('handles updated-only managed jobs and keeps different models separate', () => {
  const old = {
    id: 'old',
    kind: 'managed-model',
    stage: 'failed',
    updated_at: 10,
    plan: { repository: 'repo/model', engine: 'vllm' },
  }
  const current = { ...old, id: 'new', stage: 'downloading', updated_at: 30 }
  const other = {
    ...current,
    id: 'other',
    updated_at: 100,
    plan: { repository: 'repo/other', engine: 'mlx' },
  }
  expect(connectionDownload([current, other, old], 'repo/model')).toBe(current)
  expect(connectionDownload([current, other, old])).toBe(other)
  const resumed = { ...old, stage: 'downloading', updated_at: 40 }
  expect(connectionDownload([current, resumed, other], 'repo/model')).toBe(resumed)
})

it('does not replace the text model when media category is carried on the job', () => {
  expect(connectionDownload([job, { id: 'image', category: 'image', model_id: 'image-model' }])).toBe(job)
})

it('waits for the chosen engine even when its model file is already downloaded', () => {
  const local = [{ id: 'qwen', provider: 'atomic-prism' }]
  const pending = [
    { id: 'engine', taskId: 'engine', kind: 'engine', engine: 'atomic-prism', stage: 'downloading' },
  ]
  expect(connectionModelState('qwen', local, [], pending, 'atomic-prism')).toMatchObject({
    ready: false,
    waiting: true,
    status: 'The engine is downloading. Wait until it is ready.',
  })
  expect(
    connectionModelState('qwen', local, [], [{ ...pending[0], stage: 'ready' }], 'atomic-prism')
  ).toMatchObject({ ready: true, waiting: false })
})
