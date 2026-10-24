import { expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { watchEngineDownload } from './engine-progress.js'

it('restores progress from a snapshot, follows only its task, and detaches on stop', () => {
  const link = fakeCoreLink(),
    progress = vi.fn()
  const first = { taskId: 'engine', transferred: 20, total: 100, percent: 20 }
  link.snapshotValue.downloads = [first]
  const stop = watchEngineDownload(link, 'engine', progress)
  expect(progress).toHaveBeenLastCalledWith(first)
  link.emit({ event: 'download:progress', data: { ...first, taskId: 'model' } } as never)
  expect(progress).toHaveBeenCalledTimes(1)
  const next = { ...first, transferred: 60, percent: 60 }
  link.emit({ event: 'download:progress', data: { payload: next } } as never)
  expect(progress).toHaveBeenLastCalledWith(next)
  stop()
  link.emit({ event: 'download:progress', data: first } as never)
  expect(progress).toHaveBeenCalledTimes(2)
})

it('detaches when the intro closes without cancelling the engine installation', () => {
  const link = fakeCoreLink(),
    progress = vi.fn(),
    lifetime = new AbortController()
  watchEngineDownload(link, 'engine', progress, lifetime.signal)
  lifetime.abort()
  link.emit({
    event: 'download:progress',
    data: { taskId: 'engine', transferred: 20, total: 100, percent: 20 },
  } as never)
  expect(progress).not.toHaveBeenCalled()
  expect(link.calls).toEqual([])
})
