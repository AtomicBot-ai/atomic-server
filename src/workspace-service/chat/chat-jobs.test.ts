import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { atcPathsFor } from '../../config/index.js'
import { ChatHistory, ClientKeys } from '../../terminal-data/index.js'
import { ChatJobs } from './chat-jobs.js'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true })))

/** A chat job against a fake API whose answer streams only once `release` is called. */
async function harness() {
  const folder = mkdtempSync(join(tmpdir(), 'atc-chat-jobs-'))
  folders.push(folder)
  const paths = atcPathsFor(folder)
  const link = fakeCoreLink()
  link.snapshotValue.server = { ...link.snapshotValue.server, running: true }
  link.snapshotValue.sessions = [{ provider: 'llamacpp-upstream', model_id: 'm', port: 0 }] as never
  link.request = (async (_m: string, path: string) =>
    path === '/cloud/providers' ? { providers: [] } : {}) as typeof link.request
  const releases: Array<() => void> = []
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            await new Promise<void>((resolve) => releases.push(resolve))
            const line = (data: unknown) =>
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
            line({ choices: [{ delta: { role: 'assistant', content: 'answer' } }] })
            line({ choices: [{ delta: {}, finish_reason: 'stop' }] })
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        })
      )
  ) as unknown as typeof globalThis.fetch
  const keys = new ClientKeys(paths.atcDir)
  await keys.initialize('test-key')
  const history = new ChatHistory(paths.atcDir)
  const capture = vi.fn()
  const jobs = new ChatJobs(
    { link, paths, config: defaultConfig(), fetch, errors: { capture } },
    keys,
    history,
    async (b) => b
  )
  const settled = async (id: string) => {
    await vi.waitFor(() => expect(['complete', 'failed', 'stopped']).toContain(jobs.get(id).state))
    return jobs.get(id)
  }
  // The answer streams once the request reached the fake API and this is called.
  const release = async () => {
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0))
    releases.splice(0).forEach((r) => r())
  }
  return { jobs, history, release, settled, fetch, capture }
}
const messages = [{ role: 'user', content: 'hi' }]

it('does not report a generation failure already owned by the core HTTP boundary', async () => {
  const { jobs, settled, fetch, capture } = await harness()
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { message: 'engine failed' } }, { status: 500 })
  )
  const job = await jobs.start({ request: { model: 'm', messages } })
  expect((await settled(job.id)).state).toBe('failed')
  expect(capture).not.toHaveBeenCalled()
})

it('reports a history read failure even when fallback persistence succeeds', async () => {
  const { jobs, history, release, settled, capture } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  vi.spyOn(history, 'load').mockRejectedValueOnce(Object.assign(new Error('read failed'), { code: 'EIO' }))
  await release()
  const result = await settled(job.id)
  expect(result.state).toBe('complete')
  expect(result.conversation_revision).toBe((await history.load(job.conversation_id))?.revision)
  expect(capture).toHaveBeenCalledTimes(1)
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ tags: expect.objectContaining({ operation: 'history.load' }) })
  )
})

it('reports a background answer persistence failure without the conversation content', async () => {
  const { jobs, history, release, settled, capture } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  vi.spyOn(history, 'save').mockRejectedValueOnce(
    Object.assign(new Error('disk write failed'), { code: 'EIO' })
  )
  await release()
  expect((await settled(job.id)).state).toBe('failed')
  expect(capture).toHaveBeenCalledTimes(1)
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      tags: expect.objectContaining({ component: 'chat', operation: 'history.save' }),
    })
  )
  expect(JSON.stringify(capture.mock.calls)).not.toContain('"content"')
})

it('keeps a rename made while the answer streams, and appends the answer to it', async () => {
  const { jobs, history, release, settled } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  const saved = (await history.load(job.conversation_id))!
  await history.save({ ...saved, title: 'Renamed while generating' })
  await release()
  await settled(job.id)
  const after = (await history.load(job.conversation_id))!
  expect(after.title).toBe('Renamed while generating')
  expect(after.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
})

it('does not bring back a conversation deleted while its answer streamed', async () => {
  const { jobs, history, release, settled } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  await history.remove(job.conversation_id)
  await release()
  await settled(job.id)
  expect(await history.load(job.conversation_id)).toBeNull()
})

it('runs one request per conversation even when two start at once', async () => {
  const { jobs, history, release, settled, fetch } = await harness()
  const first = await jobs.start({ request: { model: 'm', messages } })
  await release()
  await settled(first.id)
  const input = {
    request: { model: 'm', messages: [...messages, { role: 'user', content: 'again' }] },
    conversation_id: first.conversation_id,
    expected_revision: (await history.load(first.conversation_id))?.revision ?? 0,
  }
  const results = await Promise.allSettled([jobs.start(input), jobs.start(input)])
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  await release()
  const second = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>
  await settled(second.value.id)
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
})

it('lists the requests still running, by conversation, for the other clients to follow', async () => {
  const { jobs, release, settled } = await harness()
  expect(jobs.running()).toEqual([])
  const job = await jobs.start({ request: { model: 'm', messages } })
  expect(jobs.running()).toEqual([
    {
      id: job.id,
      conversation_id: job.conversation_id,
      state: expect.stringMatching(/preparing|generating/),
    },
  ])
  await release()
  await settled(job.id)
  expect(jobs.running()).toEqual([])
})

it('rejects a stale tab after another request has completed without changing durable messages', async () => {
  const { jobs, history, release, settled, fetch } = await harness()
  const first = await jobs.start({ request: { model: 'm', messages } })
  await release()
  await settled(first.id)
  const stale = (await history.load(first.conversation_id))!
  const second = await jobs.start({
    conversation_id: stale.id,
    expected_revision: stale.revision ?? 0,
    request: { model: 'm', messages: [...stale.messages, { role: 'user', content: 'new turn' }] },
  })
  await release()
  await settled(second.id)
  const latest = (await history.load(stale.id))!
  await expect(
    jobs.start({
      conversation_id: stale.id,
      expected_revision: stale.revision ?? 0,
      request: { model: 'm', messages: [...stale.messages, { role: 'user', content: 'stale turn' }] },
    })
  ).rejects.toThrow(/changed|Reopen/)
  expect((await history.load(stale.id))?.messages).toEqual(latest.messages)
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
})

it('reports a read failure but refuses fallback persistence over a newer saved revision', async () => {
  const { jobs, history, release, settled, capture } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  const saved = (await history.load(job.conversation_id))!
  await history.save({ ...saved, title: 'New title from another client' })
  const latest = (await history.load(saved.id))!
  vi.spyOn(history, 'load').mockRejectedValueOnce(Object.assign(new Error('read failed'), { code: 'EIO' }))
  await release()
  expect((await settled(job.id)).state).toBe('failed')
  expect(await history.load(saved.id)).toEqual(latest)
  expect(capture).toHaveBeenCalledTimes(1)
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ tags: expect.objectContaining({ operation: 'history.load' }) })
  )
})
