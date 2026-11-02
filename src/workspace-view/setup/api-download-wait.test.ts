import { expect, it } from 'vitest'
import { apiDownloadWait } from './api-download-wait.js'
import { setupModelPending } from './inference-readiness.js'
import type { WorkspaceSnapshot } from '../../contract/index.js'
const model = 'mistralai/Ministral-3-3B-Instruct-2512-Q4_K_M'
const pending = {
  api: { running: true },
  services: [],
  downloads: [],
  selection: { model, engine: 'llamacpp-upstream|b1|cpu' },
  setups: [
    { setup_id: 'text', stage: 'downloading_model', plan: { model_id: model } },
    { id: 'image', stage: 'downloading', plan: { model_id: 'image', category: 'image' } },
  ],
} as unknown as WorkspaceSnapshot
it('uses the saved first model even if the terminal still has an older model choice', () => {
  expect(setupModelPending(pending, 'old-catalog-choice')).toBe(true)
  expect(apiDownloadWait(pending)).toEqual({
    label: 'Model is downloading...',
    message: 'Wait for the model to download before starting the API.',
  })
})
it('allows a ready model to keep serving and ignores optional media downloads', () => {
  expect(apiDownloadWait({ ...pending, services: [{ kind: 'chat', state: 'ready' }] as never })).toBeNull()
  expect(apiDownloadWait({ ...pending, setups: pending.setups.slice(1) })).toBeNull()
  expect(
    apiDownloadWait({ ...pending, setups: [{ setup_id: 'text', stage: 'ready', plan: { model_id: model } }] })
  ).toBeNull()
})
it.each(['paused', 'failed', 'interrupted'])('offers recovery for %s rather than an API action', (stage) => {
  expect(
    apiDownloadWait({ ...pending, setups: [{ setup_id: 'text', stage, plan: { model_id: model } }] })?.message
  ).toContain('Resume the model download')
})
it('blocks while the selected engine is downloading', () => {
  expect(
    apiDownloadWait({
      ...pending,
      setups: [],
      downloads: [{ taskId: 'e', kind: 'engine', engine: 'llamacpp-upstream', stage: 'downloading' }],
    })?.label
  ).toBe('Engine is downloading...')
})

it('does not miss a download before its selection or setup record has arrived', () => {
  expect(apiDownloadWait({ ...pending, selection: { model: 'old', engine: 'old' } })?.label).toBe(
    'Model is downloading...'
  )
  expect(
    apiDownloadWait({ setups: [], downloads: [{ taskId: 'm', transferred: 1, total: 100 }] })?.label
  ).toBe('Model is downloading...')
  expect(apiDownloadWait({ setups: [], downloads: [] }, true)?.label).toBe('Model is preparing...')
})
