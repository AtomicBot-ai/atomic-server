import { expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { requireReadiness } from './require-readiness.js'
const state = (running: boolean, ready = false) =>
  ({
    api: { running },
    setups: [],
    downloads: [],
    loads: [],
    services: ready
      ? [{ id: 'q', kind: 'chat', model: 'qwen', provider: 'llamacpp-upstream', state: 'ready', details: {} }]
      : [],
  }) as unknown as WorkspaceSnapshot
it.each(['chat.start', 'chat.complete'])('rejects %s before a model is ready', async (operation) => {
  await expect(
    requireReadiness(operation, { request: { model: 'qwen' } }, async () => state(true))
  ).rejects.toThrow('Choose and download')
})
// The API serves without a model (`atc api start`, `api.autoStart`): a Start with nothing loaded is not an error.
it('does not interfere with the API, daemon management, stop, downloads or cancellation', async () => {
  const snapshot = vi.fn()
  for (const operation of [
    'api.start',
    'api.restart',
    'api.stop',
    'setup.resume',
    'chat.cancel',
    'engines.install',
    'models.load',
  ])
    await requireReadiness(operation, {}, snapshot)
  expect(snapshot).not.toHaveBeenCalled()
})
it('requires the API before chat and matches the requested model', async () => {
  await expect(
    requireReadiness('chat.start', { request: { model: 'qwen' } }, async () => state(false, true))
  ).rejects.toThrow('Start the server')
  await expect(
    requireReadiness('chat.start', { request: { model: 'other' } }, async () => state(true, true))
  ).rejects.toThrow('Choose and download')
  await expect(
    requireReadiness('chat.start', { request: { model: 'qwen' } }, async () => state(true, true))
  ).resolves.toBeUndefined()
})

it.each(['', '   ', undefined])(
  'rejects empty model %j before checking or submitting inference',
  async (model) => {
    const snapshot = vi.fn(async () => state(true, true))
    for (const operation of ['chat.start', 'chat.complete'])
      await expect(requireReadiness(operation, { request: { model } }, snapshot)).rejects.toThrow(
        'Choose a model'
      )
    expect(snapshot).not.toHaveBeenCalled()
  }
)
