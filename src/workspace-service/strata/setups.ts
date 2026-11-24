import { AtomicCoreError } from '@atomic-chat/core'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseStrataDescriptor, strataSourceDigest } from '@atomic-chat/core/client'
import type { StrataCheckResult, StrataPreparationOperation } from '@atomic-chat/core/contracts'
import { ModelRegistry, serializeModelYml } from '@atomic-chat/core/models'
import { stagedDownloadBytes } from '../../downloads/index.js'
import type { Downloader } from '../../downloads/index.js'
import { AtcError } from '../../errors/index.js'
import { replaceFile, writeDocument } from '../../terminal-data/index.js'
import { downloadProxy } from '../models/download-proxy.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { SerialWork } from '../serial.js'
import { SetupJournal } from '../setup-journal.js'
import type { SetupJob } from '../setup-journal.js'
import { strataPlan, verifyStrataPlan } from './plan.js'
import type { StrataPlan } from './plan.js'
import {
  downloadStrataSources,
  importStrataSources,
  stagedStrataImportBytes,
  strataDownloadItems,
} from './sources.js'
import { prepareStrata, StrataPreparationFailed, strataServerStopped } from './preparation.js'
import { STRATA_OWNED_FILE, StrataMaintenance } from './maintenance.js'

type StrataJob = SetupJob<StrataPlan> & { kind: 'strata-model' }
type StrataJobView = StrataJob & { task_ids: { download: string }; preparation?: StrataPreparationOperation }
const taskId = (id: string) => 'atc-strata-download-' + id
const cancellation = new Error('Strata setup cancelled.')

export class StrataSetups {
  readonly journal: SetupJournal<StrataPlan, StrataJob>
  private readonly lanes = new SerialWork()
  private stopped = false
  private readonly controllers = new Map<string, AbortController>()
  private readonly maintenance: StrataMaintenance

  constructor(
    private readonly options: WorkspaceServiceOptions,
    private readonly downloader: Pick<Downloader, 'download' | 'cancel' | 'snapshot'>,
    private readonly ensureEngine?: (id: string) => Promise<void>
  ) {
    this.maintenance = new StrataMaintenance(options)
    this.journal = new SetupJournal({
      directory: join(options.paths.atcDir, 'strata-model-setups'),
      kind: 'strata-model',
      policy: { awaitWorkerOnCancel: true, recordTransferred: true, awaitCancelledBeforeInstall: true },
      reviewFirst: 'Review a Strata model plan first.',
      noSuch: 'No such Strata model setup.',
      hasPlan: (plan) => Boolean(plan.descriptor),
      isInstalled: (plan) => this.ready(plan.model_id, plan.source_digest),
      downloader: {
        cancel: (id) => downloader.cancel(taskId(id)),
        snapshot: () =>
          downloader
            .snapshot()
            .filter((transfer) => transfer.taskId.startsWith(taskId('')))
            .map((transfer) => ({ ...transfer, taskId: transfer.taskId.slice(taskId('').length) })),
      },
      run: (job, worker) => this.lanes.run(job.plan.model_id, () => this.run(job, worker)),
    })
  }

  plan(model: string, refresh: boolean, importDirectory?: string) {
    return strataPlan(this.options, model, refresh, importDirectory).then((plan) => this.journal.record(plan))
  }

  async list(): Promise<StrataJobView[]> {
    const jobs = await this.journal.list()
    if (!jobs.length) return []
    const operations = await this.options.link.request<StrataPreparationOperation[]>(
      'GET',
      '/strata/preparations'
    )
    return jobs.map((job) => {
      const prefix = 'atc-strata-prepare-' + job.id
      const preparation = operations.findLast(
        (op) =>
          op.source_digest === job.plan.source_digest &&
          (op.request_id === prefix || op.request_id.startsWith(prefix + ':'))
      )
      return { ...job, task_ids: { download: taskId(job.id) }, ...(preparation ? { preparation } : {}) }
    })
  }

  stop() {
    this.stopped = true
    for (const [id, controller] of this.controllers) {
      controller.abort(strataServerStopped)
      this.downloader.cancel(taskId(id))
    }
  }

  async cancel(id: string) {
    this.controllers.get(id)?.abort(cancellation)
    const job = await this.journal.cancel(id)
    const active = (await this.list()).find((item) => item.id === id)?.preparation
    if (active && ['queued', 'preparing', 'verifying', 'interrupted'].includes(active.state)) {
      const path = '/strata/preparations/' + encodeURIComponent(active.operation_id) + '/cancel'
      await this.options.link.request('POST', path, {})
    }
    return job
  }

  async discard(id: string) {
    await this.cancel(id)
    return this.journal.remove(id, (job) =>
      this.lanes.run(job.plan.model_id, async () => {
        if (await this.maintenance.pending(job.plan.model_id))
          throw new AtcError('ATC_USAGE', 'Complete Strata maintenance before discarding this setup.')
        const installed = await new ModelRegistry(this.options.paths.layout, 'strata').find(job.plan.model_id)
        if (installed?.yml.strata?.source_digest === job.plan.source_digest)
          throw new AtcError(
            'ATC_USAGE',
            'The Strata sources are installed. Remove them from Installed models.'
          )
        const stage = join(this.options.paths.layout.provider('strata').root, 'transfers', id)
        await rm(stage, { recursive: true, force: true })
      })
    )
  }

  remove(modelId: string) {
    return this.lanes.run(modelId, () => this.maintenance.remove(modelId))
  }

  private async ready(modelId: string, digest: string) {
    const { link, paths } = this.options
    const record = await new ModelRegistry(paths.layout, 'strata').find(modelId)
    if (record?.yml.strata?.source_digest !== digest) return false
    const check = await link.request<StrataCheckResult>('POST', '/models/strata/check', { model_id: modelId })
    return check.verdict === 'ok' && check.preparation_status === 'ready'
  }

  private async run(job: StrataJob, worker: { cancelled: boolean }) {
    if (worker.cancelled || this.stopped) return
    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    const signal = controller.signal
    const { link, paths, env, config } = this.options
    const { plan } = job
    try {
      const descriptor = parseStrataDescriptor(plan.descriptor)
      const digest = await strataSourceDigest(descriptor)
      verifyStrataPlan(plan, descriptor, digest)
      const stage = join(paths.layout.provider('strata').root, 'transfers', job.id)
      const modelId = descriptor.variant_id
      const registry = new ModelRegistry(paths.layout, 'strata')
      const target = join(paths.layout.provider('strata').modelsDir, modelId)
      const existing = await registry.find(modelId)
      if (existing?.yml.strata?.source_digest !== digest) {
        const check = async () => {
          const route = '/models/strata/check'
          const initial = await link.request<StrataCheckResult>('POST', route, { descriptor })
          if (initial.verdict !== 'insufficient-disk') return initial
          const staged_bytes = plan.import_directory
            ? await stagedStrataImportBytes(stage, descriptor.files, signal)
            : await stagedDownloadBytes(strataDownloadItems(stage, descriptor), paths.dataFolder, signal)
          if (!staged_bytes) return initial
          try {
            return await link.request<StrataCheckResult>('POST', route, { descriptor, staged_bytes })
          } catch (error) {
            // Published core 0.24.2 has the one-field descriptor check.
            if (
              error instanceof AtomicCoreError &&
              error.code === 'INVALID_ARGUMENT' &&
              error.message === 'Send a Strata descriptor or model_id.'
            )
              return initial
            throw error
          }
        }
        let verdict = await check()
        if (verdict.verdict === 'engine-not-installed' && this.ensureEngine) {
          await this.ensureEngine(job.id)
          verdict = await check()
        }
        if (verdict.verdict !== 'ok') throw new Error(verdict.reason ?? verdict.verdict)
        if (!plan.import_directory && descriptor.gated && !env?.['HF_TOKEN'])
          throw new Error('Accept the model license and set HF_TOKEN on the server.')
        await this.journal.step(job, worker, 'downloading')
        signal.throwIfAborted()
        await mkdir(stage, { recursive: true, mode: 0o700 })
        if (plan.import_directory)
          await importStrataSources(plan.import_directory, stage, descriptor.files, signal)
        else
          await downloadStrataSources(
            this.downloader.download.bind(this.downloader),
            taskId(job.id),
            stage,
            descriptor,
            downloadProxy(config),
            env?.['HF_TOKEN']
          )
        signal.throwIfAborted()
        // core-boundary: model.yml — acquisition metadata, written only once each staged input is verified
        const marker = join(stage, 'model.yml')
        const temporary = marker + '.' + randomUUID() + '.tmp'
        try {
          await writeFile(
            temporary,
            serializeModelYml({
              name: descriptor.name,
              model_path: `strata/models/${modelId}/${descriptor.inputs.weights[0]!}`,
              size_bytes: descriptor.requirements.download_bytes,
              strata: { schema_version: 1, source_digest: digest, descriptor },
            }),
            { mode: 0o600 }
          )
          await writeDocument(join(stage, STRATA_OWNED_FILE), { model_id: modelId })
          await replaceFile(temporary, marker)
        } finally {
          await rm(temporary, { force: true })
        }
      }
      signal.throwIfAborted()
      await this.journal.step(job, worker, 'preparing')
      const prepare = (guard?: string) =>
        prepareStrata(
          link,
          {
            request_id: 'atc-strata-prepare-' + job.id + (guard ? ':' + guard : ''),
            model_id: modelId,
            source_digest: digest,
            ...(guard ? { maintenance_id: guard } : {}),
          },
          signal
        )
      const replaced = await this.maintenance.replaceIfNeeded(
        modelId,
        job.id,
        digest,
        stage,
        !!existing && existing.yml.strata?.source_digest !== digest,
        prepare
      )
      if (!replaced) {
        if (!existing) {
          const occupied = await lstat(target).then(
            () => true,
            (error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return false
              throw error
            }
          )
          if (occupied) throw new AtcError('ATC_USAGE', 'The Strata model directory is occupied.')
          await mkdir(dirname(target), { recursive: true })
          await replaceFile(stage, target)
        }
        await prepare()
      }
      if (!(await this.ready(modelId, digest)))
        throw new StrataPreparationFailed('Strata readiness could not be verified.')
      await this.journal.write(job, 'ready')
    } catch (error) {
      await this.journal.step(
        job,
        worker,
        signal.reason === strataServerStopped ? 'interrupted' : 'failed',
        error
      )
    } finally {
      this.controllers.delete(job.id)
    }
  }
}
