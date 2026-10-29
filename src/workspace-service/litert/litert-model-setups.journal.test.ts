import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { LiteRtModelSetups } from './litert-model-setups.js'

/**
 * Characterization of the journal's cancel and foreign-digest rules. LiteRT resolves cancel without
 * waiting for the worker and does not copy `transferred`. The sibling file keeps the existing suite
 * under the 300-line cap.
 */

const REPO = 'litert-community/gemma-4-E4B-it-litert-lm'
const REV = '1'.repeat(40)
const GPU = Buffer.from('gpu weights')
const CPU = Buffer.from('cpu weights, a little longer')
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex')

let dirs: string[] = []
afterEach(() => {
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))
  dirs = []
})

function setups(downloader: ConstructorParameters<typeof LiteRtModelSetups>[0]['downloader']) {
  const data = mkdtempSync(join(tmpdir(), 'atc-litert-journal-'))
  dirs.push(data)
  const variant = (id: string, backend: string, path: string, body: Buffer) => ({
    id,
    backend,
    platforms: ['linux-x64'],
    file: { path, size: body.length, sha256: sha(body) },
  })
  const list = {
    schema_version: 1,
    updated_at: '2026-10-21T00:00:00Z',
    huggingface: { orgs: [], filter: 'litert-lm', backends: {} },
    models: [
      {
        id: 'gemma-4-e4b',
        name: 'Gemma 4 E4B',
        description: 'Gemma 4.',
        task: 'chat',
        license: 'gemma',
        repo: REPO,
        revision: REV,
        gated: false,
        context_length: 32768,
        tools: true,
        reasoning: true,
        vision: true,
        variants: [
          variant('gemma-4-e4b-gpu', 'gpu', 'gemma-4-E4B-it-gpu.litertlm', GPU),
          variant('gemma-4-e4b-cpu', 'cpu', 'gemma-4-E4B-it.litertlm', CPU),
        ],
      },
    ],
  }
  writeFileSync(join(data, 'list.json'), JSON.stringify(list))
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'litert-lm' }] }
  link.responses['POST /models/litert-lm/check'] = { verdict: 'ok', reason: null }
  return new LiteRtModelSetups({
    link,
    fetch,
    list: { cachePath: join(data, 'cache.json'), url: pathToFileURL(join(data, 'list.json')).href },
    platform: 'linux',
    arch: 'x64',
    hub: 'http://127.0.0.1:9',
    modelsDir: join(data, 'litert-lm', 'models'),
    directory: join(data, 'jobs'),
    downloader,
  })
}

/**
 * A download that stays pending until `release`. `cancel` only marks that call to reject with
 * `Download cancelled`; `snapshot` reports 17 bytes on this task. LiteRT's downloader type has no
 * `snapshot`, so a present one must be ignored.
 */
function heldDownload(id: string) {
  let marked = false
  let released = false
  let calls = 0
  let rejectPending: (error: Error) => void = () => {}
  const pending = new Promise<void>((_, reject) => {
    rejectPending = reject
  })
  pending.catch(() => {})
  let markStarted: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  return {
    started,
    get calls() {
      return calls
    },
    get hanging() {
      return !released
    },
    release: () => {
      if (released) return
      released = true
      rejectPending(new Error(marked ? 'Download cancelled' : 'released'))
    },
    downloader: {
      download: async (taskId: string) => {
        if (taskId !== id) return
        calls += 1
        markStarted()
        await pending
      },
      cancel: (taskId: string) => {
        if (taskId === id) marked = true
        return true
      },
      snapshot: () => [{ taskId: id, transferred: 17, total: 17, percent: 100 }],
    },
  }
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('LiteRtModelSetups journal', () => {
  it('finishes cancel while the download is still hanging and records no transferred', async () => {
    const held = heldDownload('r-cancel')
    try {
      const s = setups(held.downloader)
      const plan = await s.plan({ model: 'gemma-4-e4b', backend: 'gpu' })
      await s.install({ request_id: 'r-cancel', plan_digest: plan.digest })
      await held.started
      const job = await s.cancel('r-cancel')
      expect(held.hanging).toBe(true)
      expect(job).toMatchObject({ stage: 'cancelled' })
      expect(job).not.toHaveProperty('transferred')
    } finally {
      held.release()
    }
  })

  it('holds a second install of a cancelled request until the first download ends', async () => {
    const held = heldDownload('r-again')
    try {
      const s = setups(held.downloader)
      const plan = await s.plan({ model: 'gemma-4-e4b', backend: 'gpu' })
      await s.install({ request_id: 'r-again', plan_digest: plan.digest })
      await held.started
      await s.cancel('r-again')
      let settled = false
      const again = s.install({ request_id: 'r-again', plan_digest: plan.digest }).then(
        (job) => {
          settled = true
          return job
        },
        (error: unknown) => {
          settled = true
          throw error
        }
      )
      await turn()
      expect(settled).toBe(false)
      expect(held.hanging).toBe(true)
      held.release()
      await expect(again).resolves.toMatchObject({ id: 'r-again' })
    } finally {
      held.release()
    }
  })

  it('rejects another plan on the same request id and does not start that download', async () => {
    const held = heldDownload('r-other')
    try {
      const s = setups(held.downloader)
      const gpu = await s.plan({ model: 'gemma-4-e4b', backend: 'gpu' })
      const cpu = await s.plan({ model: 'gemma-4-e4b', backend: 'cpu' })
      expect(cpu.digest).not.toBe(gpu.digest)
      await s.install({ request_id: 'r-other', plan_digest: gpu.digest })
      await held.started
      expect(held.calls).toBe(1)
      await expect(s.install({ request_id: 'r-other', plan_digest: cpu.digest })).rejects.toMatchObject({
        code: 'ATC_USAGE',
        message: expect.stringContaining('another plan'),
      })
      expect(held.calls).toBe(1)
    } finally {
      held.release()
    }
  })
})
