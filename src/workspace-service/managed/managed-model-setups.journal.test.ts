import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { FixtureHttpServer } from '../../../test/helpers/fixture-http-server.js'
import { qwenFiles, serveRepository } from '../../../test/helpers/hf-hub.js'
import { ManagedModelSetups } from './managed-model-setups.js'

/**
 * Characterization of the journal's cancel and foreign-digest rules. The production class is unchanged;
 * the sibling file exists because `managed-model-setups.test.ts` is already at the 300-line cap.
 */

const server = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-mms-journal-'))
let hub = ''
let n = 0
const REPO = 'Qwen/Qwen3.5-2B'
const ok = {
  architectures: ['Qwen3ForCausalLM'],
  quantization_format: null,
  weight_bytes: 6144,
  checked_gpu_id: 'GPU-0',
  curated: false,
  unified_memory: false,
  fits_other_gpus: [],
  verdict: { ok: true },
}

beforeAll(async () => {
  hub = await server.start()
})
afterAll(async () => {
  server.release()
  await server.stop()
  rmSync(scratch, { recursive: true, force: true })
})
beforeEach(() => {
  server.reset()
  n += 1
  serveRepository(server, REPO, qwenFiles())
})

function core(root: string) {
  const l = fakeCoreLink()
  l.responses['POST /engines/versions'] = { engines: [{ engine: 'vllm' }, { engine: 'tensorrt-llm' }] }
  l.responses['GET /environments'] = { environments: [] }
  l.responses['POST /models/vllm/check'] = ok
  l.responses['POST /models/tensorrt-llm/check'] = ok
  l.responses['GET /managed-models/location'] = { root, free_bytes: 10 * 1024 ** 3 }
  l.responses[`GET /models/vllm/${REPO}/capabilities`] = { model_id: REPO }
  return l
}

function setups(downloader: ConstructorParameters<typeof ManagedModelSetups>[0]['downloader']) {
  const root = join(scratch, `store-${n}`)
  const dataFolder = join(scratch, `data-${n}`)
  return new ManagedModelSetups({
    link: core(root),
    fetch,
    env: { HF_ENDPOINT: hub },
    directory: join(dataFolder, 'atc', 'managed-model-setups'),
    downloader,
  })
}

/**
 * A download that stays pending until `release`. `cancel` only marks that call to reject with
 * `Download cancelled`; `snapshot` reports 17 bytes on this task.
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

const turn = () => new Promise((resolve) => setImmediate(resolve))

describe('ManagedModelSetups journal', () => {
  it('does not finish cancel until the hanging download ends, then records transferred 17', async () => {
    const held = heldDownload('r-cancel')
    try {
      const s = setups(held.downloader)
      const plan = await s.plan({ repository: REPO, engine: 'vllm' })
      await s.install({ request_id: 'r-cancel', plan_digest: plan.digest })
      await held.started
      let settled = false
      const cancelling = s.cancel('r-cancel').then(
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
      await expect(cancelling).resolves.toMatchObject({ stage: 'cancelled', transferred: 17 })
    } finally {
      held.release()
    }
  })

  it('rejects another plan on the same request id and does not start that download', async () => {
    const held = heldDownload('r-other')
    try {
      const s = setups(held.downloader)
      const vllm = await s.plan({ repository: REPO, engine: 'vllm' })
      const tensor = await s.plan({ repository: REPO, engine: 'tensorrt-llm' })
      expect(tensor.digest).not.toBe(vllm.digest)
      await s.install({ request_id: 'r-other', plan_digest: vllm.digest })
      await held.started
      expect(held.calls).toBe(1)
      await expect(s.install({ request_id: 'r-other', plan_digest: tensor.digest })).rejects.toMatchObject({
        code: 'ATC_USAGE',
        message: expect.stringContaining('another plan'),
      })
      expect(held.calls).toBe(1)
    } finally {
      held.release()
    }
  })
})
