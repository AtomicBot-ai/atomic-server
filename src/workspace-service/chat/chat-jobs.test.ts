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
  const jobs = new ChatJobs({ link, paths, config: defaultConfig(), fetch }, keys, history, async (b) => b)
  const settled = async (id: string) => {
    await vi.waitFor(() => expect(['complete', 'failed', 'stopped']).toContain(jobs.get(id).state))
    return jobs.get(id)
  }
  // The answer streams once the request reached the fake API and this is called.
  const release = async () => {
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0))
    releases.splice(0).forEach((r) => r())
  }
  return { jobs, history, release, settled, fetch }
}
const messages = [{ role: 'user', content: 'hi' }]

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
  const { jobs, release, settled, fetch } = await harness()
  const first = await jobs.start({ request: { model: 'm', messages } })
  await release()
  await settled(first.id)
  const input = {
    request: { model: 'm', messages: [...messages, { role: 'user', content: 'again' }] },
    conversation_id: first.conversation_id,
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
