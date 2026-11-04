import { expect, it, vi } from 'vitest'
import { suspendDownloadingApi } from './download-api.js'
import type { WorkspaceSnapshot } from '../../contract/index.js'
it('stops an empty listener when downloading begins but preserves a live model and ignores unrelated changes', async () => {
  const state = {
    api: { running: true },
    services: [],
    setups: [{ setup_id: 'job', stage: 'downloading_model', plan: { model_id: 'q' } }],
    downloads: [],
  } as unknown as WorkspaceSnapshot
  const snapshot = vi.fn(async () => state),
    stop = vi.fn(async () => ({}))
  await suspendDownloadingApi('models.install', snapshot, stop)
  expect(stop).toHaveBeenCalledOnce()
  state.services = [{ kind: 'chat', state: 'ready' }] as never
  await suspendDownloadingApi('models.install', snapshot, stop)
  expect(stop).toHaveBeenCalledOnce()
  snapshot.mockClear()
  await suspendDownloadingApi('config.update', snapshot, stop)
  expect(snapshot).not.toHaveBeenCalled()
})

it.each(['audio', 'image-video', 'embedding', 'decision'] as const)(
  'does not suspend an API serving %s when another download begins',
  async (kind) => {
    const snapshot = async () =>
      ({
        api: { running: true },
        services: [{ kind, state: 'loaded' }],
        setups: [{ setup_id: 'job', stage: 'downloading_model', plan: { model_id: 'q' } }],
        downloads: [],
      }) as unknown as WorkspaceSnapshot
    const stop = vi.fn(async () => ({}))
    await suspendDownloadingApi('models.install', snapshot, stop)
    await suspendDownloadingApi('engines.enqueue', snapshot, stop)
    expect(stop).not.toHaveBeenCalled()
  }
)

it('does not stop an empty text API for an unrelated audio engine installation', async () => {
  const snapshot = {
    api: { running: true },
    services: [],
    setups: [],
    selection: { model: 'qwen', engine: 'llamacpp-upstream|b1|cpu' },
    downloads: [{ id: 'audio', kind: 'engine', engine: 'audio-cpp', stage: 'downloading' }],
  } as unknown as WorkspaceSnapshot
  const stop = vi.fn(async () => ({}))
  await suspendDownloadingApi('engines.enqueue', async () => snapshot, stop)
  expect(stop).not.toHaveBeenCalled()
})
