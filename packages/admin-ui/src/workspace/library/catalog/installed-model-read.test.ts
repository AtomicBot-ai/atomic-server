import { expect, it, vi } from 'vitest'
import { readInstalledModels } from './installed-model-read'
import type { Execute } from '../../types'
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
it('shares a slow read and waits for every operation even when one rejects early', async () => {
  const chat = deferred()
  const execute = vi.fn((name: string) =>
    name === 'models.installed' ? chat.promise : Promise.reject(new Error('media offline'))
  )
  const first = readInstalledModels(execute as Execute).catch((e) => e.message)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const second = readInstalledModels(execute as Execute).catch((e) => e.message)
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(1)
  chat.resolve([])
  expect(await first).toBe('media offline')
  expect(await second).toBe('media offline')
})
it('schedules one fresh read after a mutation without overlapping the previous scan', async () => {
  const chat = deferred()
  const execute = vi.fn(async (name: string) => (name === 'models.installed' ? chat.promise : []))
  const old = readInstalledModels(execute as Execute)
  const changed = readInstalledModels(execute as Execute, true)
  const anotherChange = readInstalledModels(execute as Execute, true)
  expect(execute).toHaveBeenCalledTimes(2)
  execute.mockImplementation(async () => [])
  chat.resolve([{ id: 'deleted' }])
  await old
  await Promise.all([changed, anotherChange])
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(2)
})
it('preserves raw chat rows from different stores with the same model ID', async () => {
  const chat = [
    { id: 'shared', provider: 'llamacpp-upstream' },
    { id: 'shared', provider: 'fastflowlm', store: 'fastflowlm' },
  ]
  const execute = vi.fn(async (name: string) => (name === 'models.installed' ? chat : []))
  expect(await readInstalledModels(execute as Execute)).toEqual({ chat, media: [] })
})
