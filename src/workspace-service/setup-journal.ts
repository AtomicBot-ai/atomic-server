/** The request-id download journal for Foundry, LiteRT and the managed store. Not the GGUF setups. */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkspaceInput } from '../contract/index.js'
import type { Downloader } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { listJobs } from './managed/managed-jobs.js'
import { SerialWork } from './serial.js'

/** Where `cancel` and the next `install` wait. Set together at each provider's constructor. */
export interface SetupJournalPolicy {
  /** `cancel` resolves only after the worker's `run` settles. */
  awaitWorkerOnCancel: boolean
  /** Copy this task's `snapshot` `transferred` onto the job when cancelling. */
  recordTransferred: boolean
  /** `install` waits for a cancelled worker to settle before taking its lane. */
  awaitCancelledBeforeInstall: boolean
}

export interface SetupPlan {
  digest: string
  blockers: string[]
}

export type SetupStage =
  'queued' | 'downloading' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'interrupted'

export interface SetupJob<P extends SetupPlan> {
  id: string
  kind: string
  plan: P
  stage: SetupStage
  error?: string
  updated_at: number
  transferred?: number
}

interface Worker {
  cancelled: boolean
  done: Promise<void>
}

export interface SetupJournalDeps<P extends SetupPlan, J extends SetupJob<P>> {
  directory: string
  kind: J['kind']
  policy: SetupJournalPolicy
  /** `Review the download with <provider>.plan first.` */
  reviewFirst: string
  /** `No such … download.` thrown by `cancel` when the record is missing. */
  noSuch: string
  /** The stored plan is one this provider can install (`files` or `file`). */
  hasPlan: (plan: P) => boolean
  downloader: Pick<Downloader, 'cancel'> & Partial<Pick<Downloader, 'snapshot'>>
  run: (job: J, worker: Worker) => Promise<void>
}

const ACTIVE: readonly SetupStage[] = ['queued', 'downloading', 'verifying']

/**
 * Plan by digest, job by request id, one lane per id. The provider keeps `run`: the bytes, the
 * verdict and `model.yml` are not this class's.
 */
export class SetupJournal<P extends SetupPlan, J extends SetupJob<P>> {
  private readonly running = new Map<string, Worker>()
  private readonly mutations = new SerialWork()
  readonly directory: string
  constructor(private readonly d: SetupJournalDeps<P, J>) {
    this.directory = d.directory
  }

  private path(id: string) {
    if (!/^[\w-]{1,120}$/.test(id))
      throw new AtcError('ATC_USAGE', 'Use a request ID of letters, numbers, underscores or hyphens.')
    return join(this.directory, `${id}.json`)
  }

  /** Remember a reviewed plan under its digest. The provider computed it. */
  async record(plan: P): Promise<P> {
    await writeDocument(this.path(plan.digest), plan)
    return plan
  }

  /** Every job; a running stage with no live worker (the server restarted) reads as `interrupted`. */
  list(): Promise<J[]> {
    return listJobs<J>(this.directory, this.d.kind, (job) =>
      ACTIVE.includes(job.stage) && !this.running.has(job.id) ? { ...job, stage: 'interrupted' } : job
    )
  }

  install(input: WorkspaceInput): Promise<J> {
    const id = String(input['request_id'])
    const digest = String(input['plan_digest'])
    // A cancelled worker still unwinding writes its last stage through the same lane: let it end first,
    // then continue the job afresh. Foundry and Managed do not wait here.
    const prior = this.running.get(id)
    const settled =
      this.d.policy.awaitCancelledBeforeInstall && prior?.cancelled ? prior.done : Promise.resolve()
    return settled.then(() =>
      this.mutations.run(id, async () => {
        const existing = await readDocument<J | null>(this.path(id), null)
        if (existing) {
          if (existing.plan.digest !== digest)
            throw new AtcError('ATC_USAGE', 'This request ID belongs to another plan.')
          return this.start(existing)
        }
        const plan = await readDocument<P | null>(this.path(digest), null)
        if (!plan || !this.d.hasPlan(plan)) throw new AtcError('ATC_USAGE', this.d.reviewFirst)
        if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
        return this.start({
          id,
          kind: this.d.kind,
          plan,
          stage: 'queued',
          updated_at: Date.now(),
        } as J)
      })
    )
  }

  async cancel(id: string): Promise<J> {
    const worker = this.running.get(id)
    const transferred = this.d.policy.recordTransferred
      ? this.d.downloader.snapshot?.().find((transfer) => transfer.taskId === id)?.transferred
      : undefined
    if (worker) worker.cancelled = true
    this.d.downloader.cancel(id)
    if (this.d.policy.awaitWorkerOnCancel) await worker?.done
    return this.mutations.run(id, async () => {
      const job = await readDocument<J | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', this.d.noSuch)
      if (transferred !== undefined) Object.assign(job, { transferred })
      if (job.stage !== 'ready') await this.write(job, 'cancelled')
      return job
    })
  }

  /** Stops the job, waits for its worker, then lets `cleanup` discard its files before the record goes. */
  async remove(id: string, cleanup: (job: J) => Promise<void>) {
    const worker = this.running.get(id)
    await this.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      if (this.running.has(id)) throw new AtcError('ATC_USAGE', 'Pause this download before removing it.')
      const job = await readDocument<J | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such download.')
      await cleanup(job)
      await rm(this.path(id), { force: true })
      return { removed: true as const, id }
    })
  }

  async write(job: J, stage: SetupStage, error?: unknown) {
    job.stage = stage
    job.updated_at = Date.now()
    if (error !== undefined) job.error = error instanceof Error ? error.message : String(error)
    else delete job.error
    await writeDocument(this.path(job.id), job)
  }

  /** `write`, `start` and `step` stay callable: the provider's `run` drives the stages through them. */
  async start(job: J): Promise<J> {
    if (job.stage === 'ready' || this.running.has(job.id)) return job
    const worker: Worker = { cancelled: false, done: Promise.resolve() }
    this.running.set(job.id, worker)
    await this.write(job, 'queued')
    worker.done = this.d.run(job, worker).finally(() => {
      if (this.running.get(job.id) === worker) this.running.delete(job.id)
    })
    return { ...job }
  }

  /** One step of the job, unless it was cancelled meanwhile; under the job's lock. */
  step(job: J, worker: { cancelled: boolean }, stage: SetupStage, error?: unknown) {
    return this.mutations.run(job.id, () => this.write(job, worker.cancelled ? 'cancelled' : stage, error))
  }
}
