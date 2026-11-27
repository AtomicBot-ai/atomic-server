import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { atcPathsFor, defaultConfig } from '../../config/index.js'
import { ChatHistory, ClientKeys } from '../../terminal-data/index.js'
import { ChatJobs } from './chat-jobs.js'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true })))

/**
 * A chat job whose API request never answers on its own. The fake rejects with the signal's own reason,
 * as `fetch` does, so the caller sees exactly what Node produces for an aborted request.
 */
async function harness() {
  const folder = mkdtempSync(join(tmpdir(), 'atc-chat-deadline-'))
  folders.push(folder)
  const paths = atcPathsFor(folder)
  const link = fakeCoreLink()
  link.snapshotValue.server = { ...link.snapshotValue.server, running: true }
  link.snapshotValue.sessions = [{ provider: 'llamacpp-upstream', model_id: 'm', port: 0 }] as never
  link.request = (async (_m: string, path: string) =>
    path === '/cloud/providers' ? { providers: [] } : {}) as typeof link.request
  const fetch = vi.fn(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        // `AbortSignal.any([the job's controller, AbortSignal.timeout(...)])` fires with its own reason.
        if (init.signal.aborted) return reject(init.signal.reason)
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
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
  return { jobs, settled, capture, fetch }
}

/** The rejection the job's own `AbortSignal.timeout(600000)` produces once it expires during fetch. */
const expiredDeadline = (): Promise<Response> =>
  new Promise<Response>((_resolve, reject) => {
    const signal = AbortSignal.timeout(1)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

const messages = [{ role: 'user', content: 'hi' }]

it('answers its own ten-minute deadline instead of reporting an unexpected failure', async () => {
  const { jobs, settled, capture, fetch } = await harness()
  vi.mocked(fetch).mockImplementationOnce(() => expiredDeadline())
  const job = await jobs.start({ request: { model: 'm', messages } })
  const result = await settled(job.id)
  expect(capture).not.toHaveBeenCalled()
  expect(result.state).toBe('failed')
  expect(result.error).toMatch(/did not finish within ten minutes/)
})

it('keeps a deliberate stop out of the reports and the error', async () => {
  const { jobs, settled, capture } = await harness()
  const job = await jobs.start({ request: { model: 'm', messages } })
  jobs.cancel(job.id)
  const result = await settled(job.id)
  expect(result.state).toBe('stopped')
  expect(result.error).toBeUndefined()
  expect(capture).not.toHaveBeenCalled()
})

it('still reports a genuine stream failure with its transport cause', async () => {
  const { jobs, settled, capture, fetch } = await harness()
  vi.mocked(fetch).mockRejectedValueOnce(
    new TypeError('fetch failed', { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) })
  )
  const job = await jobs.start({ request: { model: 'm', messages } })
  const result = await settled(job.id)
  expect(result.state).toBe('failed')
  expect(capture).toHaveBeenCalledTimes(1)
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      tags: expect.objectContaining({
        component: 'chat',
        operation: 'chat.stream',
        diagnostic_cause_code: 'ECONNRESET',
      }),
    })
  )
})
