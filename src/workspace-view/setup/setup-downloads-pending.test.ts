import { expect, it } from 'vitest'
import { setupDownloadsPending } from './setup-downloads-pending.js'

it.each(['queued', 'downloading', 'installing', 'paused', 'interrupted'])(
  'keeps an engine-only %s job on the waiting screen',
  (stage) => {
    expect(setupDownloadsPending({ setups: [], downloads: [{ kind: 'engine', taskId: 'e', stage }] })).toBe(
      true
    )
  }
)
it('keeps preparing and unassigned model transfers pending before their setup record arrives', () => {
  expect(setupDownloadsPending({ setups: [], downloads: [] }, true)).toBe(true)
  expect(setupDownloadsPending({ downloads: [{ taskId: 'm', transferred: 1, total: 100 }] })).toBe(true)
})
it('waits for every unfinished download, regardless of the saved selection', () => {
  expect(
    setupDownloadsPending({
      selection: { engine: 'old', model: 'old' },
      setups: [{ setup_id: 'm', stage: 'downloading_model', plan: { model_id: 'new' } }],
    })
  ).toBe(true)
})
it('leaves no pending work after all jobs finish or are removed', () => {
  for (const stage of ['ready', 'completed', 'done', 'removed', 'deleted'])
    expect(setupDownloadsPending({ downloads: [{ kind: 'engine', taskId: 'e', stage }] })).toBe(false)
})
