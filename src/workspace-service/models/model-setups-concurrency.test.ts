import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelSetup } from '../../contract/index.js'
import { writeDocument } from '../../terminal-data/index.js'
import { cleanup, fixture } from '../../../test/helpers/model-setups-fixture.js'
import { waitFor } from '../../../test/helpers/wait-for.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

const finish: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(finish.splice(0).map((fn) => fn()))
  cleanup.splice(0).forEach((fn) => fn())
})

async function heldSetup() {
  const f = fixture()
  const transfer = deferred()
  const download = vi.spyOn(f.downloader, 'download').mockImplementation(() => transfer.promise)
  const setups = f.make()
  const request = { repo: 'owner/repo', file: 'model.Q4_K_M.gguf' }
  const plan = await setups.plan(request)
  const install = (requestId: string) =>
    setups.install({ request, plan_digest: plan.digest, request_id: requestId })
  const stopped = async (id: string) => {
    const record: ModelSetup = {
      setup_id: id,
      request_id: id,
      stage: 'cancelled',
      request,
      plan,
      task_ids: { model: `model-setup-${id}-model` },
      created_at: 1,
      updated_at: 1,
    }
    await writeDocument(join(f.tmp.paths.atcDir, 'model-setups', `${id}.json`), record)
    return record
  }
  finish.push(async () => {
    const cancelling = (await setups.list()).map((r) => setups.cancel(r.setup_id))
    transfer.resolve()
    await Promise.all(cancelling)
  })
  return { f, setups, request, install, stopped, download, release: transfer.resolve }
}

it('returns one setup for simultaneous install requests with different request IDs', async () => {
  const h = await heldSetup()
  const records = await Promise.all([h.install('request-a'), h.install('request-b')])
  expect(new Set(records.map((record) => record.setup_id)).size).toBe(1)
  expect(await h.setups.list()).toHaveLength(1)
  await waitFor(() => h.download.mock.calls.length > 0)
  expect(h.download).toHaveBeenCalledTimes(1)
})

it('retains request ID idempotency for simultaneous requests', async () => {
  const h = await heldSetup()
  const records = await Promise.all([h.install('request-a'), h.install('request-a')])
  expect(records[0]?.setup_id).toBe(records[1]?.setup_id)
  expect(await h.setups.list()).toHaveLength(1)
})

it.each(['install', 'resume'] as const)(
  'allows only one writer when resume overlaps another %s of the same model',
  async (operation) => {
    const h = await heldSetup()
    await h.stopped('stopped-a')
    await h.stopped('stopped-b')
    const results = await Promise.allSettled([
      h.setups.resume('stopped-a'),
      operation === 'install' ? h.install('new-request') : h.setups.resume('stopped-b'),
    ])
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
    const refused = results.filter((result) => result.status === 'rejected')
    for (const result of refused) expect(result.reason).toMatchObject({ code: 'ATC_USAGE' })
    await waitFor(() => h.download.mock.calls.length > 0)
    expect(h.download).toHaveBeenCalledTimes(1)
    expect((await h.setups.list()).filter((r) => r.stage !== 'cancelled')).toHaveLength(1)
  }
)

it('lets different models start while the first model is still downloading', async () => {
  const h = await heldSetup()
  const otherRequest = { ...h.request, model_id: 'owner/other-model' }
  const other = await h.setups.plan(otherRequest)
  await Promise.all([
    h.install('request-a'),
    h.setups.install({ request: otherRequest, plan_digest: other.digest, request_id: 'request-b' }),
  ])
  await waitFor(() => h.download.mock.calls.length >= 2)
  expect(h.download).toHaveBeenCalledTimes(2)
  expect(await h.setups.list()).toHaveLength(2)
})

it.each(['install', 'resume'] as const)(
  'waits for removal cleanup before a new %s can open the same model files',
  async (operation) => {
    const h = await heldSetup()
    await h.stopped('old')
    await h.stopped('resume-target')
    const entered = deferred()
    const release = deferred()
    const removing = h.setups.remove('old', async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const starting = operation === 'install' ? h.install('new-request') : h.setups.resume('resume-target')
    // An unrelated model must progress while cleanup owns the first model's files.
    const request = { ...h.request, model_id: 'owner/unrelated' }
    const plan = await h.setups.plan(request)
    try {
      await h.setups.install({ request, plan_digest: plan.digest, request_id: 'unrelated' })
      await waitFor(() => h.download.mock.calls.length > 0)
      expect(h.download.mock.calls.map(([task]) => task)).not.toContain('model-setup-resume-target-model')
      expect(h.download).toHaveBeenCalledTimes(1)
    } finally {
      release.resolve()
      await removing
      await starting
    }
    await waitFor(() => h.download.mock.calls.length >= 2)
    expect(h.download).toHaveBeenCalledTimes(2)
  }
)

it('refuses to remove an older setup while another setup owns the model files', async () => {
  const h = await heldSetup()
  await h.stopped('old')
  await h.install('new-request')
  const cleanupFiles = vi.fn(async () => {})
  await expect(h.setups.remove('old', cleanupFiles)).rejects.toMatchObject({ code: 'ATC_USAGE' })
  expect(cleanupFiles).not.toHaveBeenCalled()
  expect((await h.setups.get('old')).stage).toBe('cancelled')
})

it('stops an active run before cleanup without waiting on its own write queue', async () => {
  const h = await heldSetup()
  const started = await h.install('request-a')
  await waitFor(() => h.download.mock.calls.length > 0)
  vi.spyOn(h.f.downloader, 'cancel').mockImplementation(() => {
    h.release()
    return true
  })
  const removing = h.setups.remove(started.setup_id, async (job) => {
    expect(job.stage).toBe('cancelled')
  })
  await expect(removing).resolves.toMatchObject({ removed: true })
  expect(await h.setups.list()).toEqual([])
})

it('releases model ownership after cleanup fails so a later install can proceed', async () => {
  const h = await heldSetup()
  await h.stopped('old')
  await expect(
    h.setups.remove('old', async () => {
      throw new Error('Cleanup failed')
    })
  ).rejects.toThrow('Cleanup failed')
  await h.install('new-request')
  await waitFor(() => h.download.mock.calls.length > 0)
  expect(h.download).toHaveBeenCalledTimes(1)
})
