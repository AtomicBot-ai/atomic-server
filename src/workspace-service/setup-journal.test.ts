import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { SetupJournal } from './setup-journal.js'
import type { SetupJournalPolicy } from './setup-journal.js'

/** Three cancel policies, one fake plan, no catalog and no network. */

interface Plan {
  digest: string
  blockers: string[]
  files: string[]
}
interface Job {
  id: string
  kind: 'sample'
  plan: Plan
  stage: 'queued' | 'downloading' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'interrupted'
  error?: string
  updated_at: number
  transferred?: number
}

const plan: Plan = { digest: 'a'.repeat(64), blockers: [], files: ['weights'] }
const other: Plan = { digest: 'b'.repeat(64), blockers: [], files: ['weights'] }
const POLICIES: Array<[string, SetupJournalPolicy]> = [
  ['foundry', { awaitWorkerOnCancel: true, recordTransferred: true, awaitCancelledBeforeInstall: false }],
  ['managed', { awaitWorkerOnCancel: true, recordTransferred: true, awaitCancelledBeforeInstall: false }],
  ['litert', { awaitWorkerOnCancel: false, recordTransferred: false, awaitCancelledBeforeInstall: true }],
]

const dirs: string[] = []
const live: SetupJournal<Plan, Job>[] = []
const turn = () => new Promise((resolve) => setImmediate(resolve))
const workers = (journal: SetupJournal<Plan, Job>) =>
  (journal as unknown as { running: Map<string, { cancelled: boolean; done: Promise<void> }> }).running
afterEach(async () => {
  const until = Date.now() + 2_000
  while (live.some((journal) => workers(journal).size > 0) && Date.now() < until) await turn()
  live.length = 0
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-journal-'))
  dirs.push(dir)
  return dir
}

function heldDownload(id: string) {
  let marked = false
  let released = false
  let calls = 0
  let rejectPending: (error: Error) => void = () => {}
  const pending = new Promise<void>((_, reject) => {
    rejectPending = reject
  })
  void pending.catch(() => undefined)
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

function open(directory: string, policy: SetupJournalPolicy, id: string) {
  const held = heldDownload(id)
  let run: (job: Job, worker: { cancelled: boolean }) => Promise<void> = async () => {}
  const journal = new SetupJournal<Plan, Job>({
    directory,
    kind: 'sample',
    policy,
    reviewFirst: 'Review the download with sample.plan first.',
    noSuch: 'No such sample download.',
    hasPlan: (doc) => !!doc.files,
    downloader: held.downloader,
    run: (job, worker) => run(job, worker),
  })
  live.push(journal)
  run = async (job, worker) => {
    await journal.step(job, worker, 'downloading')
    try {
      await held.downloader.download(job.id)
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      await journal
        .step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error)
        .catch(() => {})
      return
    }
    if (worker.cancelled) return void (await journal.step(job, worker, 'cancelled'))
    await journal.step(job, worker, 'ready')
  }
  return { journal, held }
}

describe.each(POLICIES)('%s journal policy', (_name, policy) => {
  it('cancels the way that policy waits, and records transferred only when asked', async () => {
    const { journal, held } = open(await temp(), policy, 'job')
    try {
      await journal.record(plan)
      await journal.install({ request_id: 'job', plan_digest: plan.digest })
      await held.started
      let settled = false
      const cancelling = journal.cancel('job').then(
        (job) => {
          settled = true
          return job
        },
        (error: unknown) => {
          settled = true
          throw error
        }
      )
      if (policy.awaitWorkerOnCancel) {
        await turn()
        expect(settled).toBe(false)
        expect(held.hanging).toBe(true)
        held.release()
        await expect(cancelling).resolves.toMatchObject({ stage: 'cancelled', transferred: 17 })
      } else {
        const job = await cancelling
        expect(held.hanging).toBe(true)
        expect(job).toMatchObject({ stage: 'cancelled' })
        expect(job).not.toHaveProperty('transferred')
      }
    } finally {
      held.release()
    }
  })

  it('rejects another plan on the same request id and does not start that download', async () => {
    const { journal, held } = open(await temp(), policy, 'job')
    try {
      await journal.record(plan)
      await journal.record(other)
      await journal.install({ request_id: 'job', plan_digest: plan.digest })
      await held.started
      expect(held.calls).toBe(1)
      await expect(journal.install({ request_id: 'job', plan_digest: other.digest })).rejects.toMatchObject({
        code: 'ATC_USAGE',
        message: expect.stringContaining('another plan'),
      })
      expect(held.calls).toBe(1)
    } finally {
      held.release()
    }
  })
})

describe('SetupJournal', () => {
  it('holds a second install until a cancelled worker finishes when that policy says so', async () => {
    const policy = POLICIES[2]![1]
    const { journal, held } = open(await temp(), policy, 'job')
    try {
      await journal.record(plan)
      await journal.install({ request_id: 'job', plan_digest: plan.digest })
      await held.started
      await journal.cancel('job')
      let settled = false
      const again = journal.install({ request_id: 'job', plan_digest: plan.digest }).then(
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
      await expect(again).resolves.toMatchObject({ id: 'job' })
    } finally {
      held.release()
    }
  })

  it('marks a job with no live worker interrupted, and leaves ready and a live download alone', async () => {
    const dir = await temp()
    const { journal, held } = open(dir, POLICIES[0]![1], 'live')
    try {
      await journal.record(plan)
      const stored = { kind: 'sample' as const, plan, error: undefined, updated_at: 1 }
      await writeDocument(join(dir, 'queued.json'), { ...stored, id: 'queued', stage: 'queued' })
      await writeDocument(join(dir, 'down.json'), { ...stored, id: 'down', stage: 'downloading' })
      await writeDocument(join(dir, 'verify.json'), { ...stored, id: 'verify', stage: 'verifying' })
      await writeDocument(join(dir, 'ready.json'), { ...stored, id: 'ready', stage: 'ready' })
      await writeDocument(join(dir, 'failed.json'), { ...stored, id: 'failed', stage: 'failed' })
      await journal.install({ request_id: 'live', plan_digest: plan.digest })
      await held.started
      const stages = Object.fromEntries((await journal.list()).map((job) => [job.id, job.stage]))
      expect(stages).toMatchObject({
        queued: 'interrupted',
        down: 'interrupted',
        verify: 'interrupted',
        ready: 'ready',
        failed: 'failed',
        live: 'downloading',
      })
    } finally {
      held.release()
    }
  })

  it('cancels, calls cleanup, and deletes the job record', async () => {
    const dir = await temp()
    const { journal, held } = open(dir, POLICIES[0]![1], 'job')
    const cleaned: string[] = []
    try {
      await journal.record(plan)
      await journal.install({ request_id: 'job', plan_digest: plan.digest })
      await held.started
      const removing = journal.remove('job', async (job) => {
        cleaned.push(job.id)
      })
      held.release()
      await expect(removing).resolves.toEqual({ removed: true, id: 'job' })
      expect(cleaned).toEqual(['job'])
      expect(await readDocument(join(dir, 'job.json'), null)).toBeNull()
    } finally {
      held.release()
    }
  })

  it('refuses to remove a request whose worker is still registered after cancel', async () => {
    const dir = await temp()
    const { journal, held } = open(dir, POLICIES[0]![1], 'job')
    const cleaned: string[] = []
    try {
      await journal.record(plan)
      await journal.install({ request_id: 'job', plan_digest: plan.digest })
      await held.started
      held.release()
      await journal.cancel('job')
      workers(journal).set('job', { cancelled: false, done: Promise.resolve() })
      await expect(
        journal.remove('job', async (job) => {
          cleaned.push(job.id)
        })
      ).rejects.toThrow('Pause this download')
      expect(cleaned).toEqual([])
      expect(await readDocument(join(dir, 'job.json'), null)).not.toBeNull()
      workers(journal).delete('job')
    } finally {
      held.release()
    }
  })

  it('keeps the request-id sentences: another plan is not the only one', async () => {
    const { journal, held } = open(await temp(), POLICIES[0]![1], 'job')
    try {
      await expect(journal.install({ request_id: 'job', plan_digest: plan.digest })).rejects.toThrow(
        'Review the download with sample.plan first.'
      )
      await journal.record({ ...plan, blockers: ['Install the engine first.'] })
      await expect(journal.install({ request_id: 'job', plan_digest: plan.digest })).rejects.toThrow(
        'Install the engine first.'
      )
      await expect(journal.install({ request_id: 'bad id', plan_digest: plan.digest })).rejects.toThrow(
        'letters, numbers, underscores or hyphens'
      )
      await expect(journal.cancel('missing')).rejects.toThrow('No such sample download.')
      expect(held.calls).toBe(0)
    } finally {
      held.release()
    }
  })
})
