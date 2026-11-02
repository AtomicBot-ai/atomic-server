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
