import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { dataLayout } from '@atomic-chat/core/host'
import { FastFlowLmRegistry, serializeModelYml } from '@atomic-chat/core/models'
import {
  buildFastFlowLmConfig,
  parseFastFlowLmDescriptor,
  FLM_MODEL_LIST_PATH,
  FLM_MODEL_INFO_PATH,
} from '@atomic-chat/core/client'
import type { FastFlowLmCheckResult, ModelYmlFastFlowLm } from '@atomic-chat/core/contracts'
import type { Downloader } from '../../downloads/index.js'
import { AtcError } from '../../errors/index.js'
import { writeDocument } from '../../terminal-data/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { SetupJournal, type SetupJob } from '../setup-journal.js'
import { SerialWork } from '../serial.js'
import { nodeStoreFiles } from '../managed/managed-model-plan.js'
import { hubAuthorized } from '../models/hub-fetch.js'
import { downloadProxy } from '../models/download-proxy.js'
import { flmPlan, type FlmPlan } from './catalog.js'
import { FlmMutations } from './mutations.js'

export type FlmJob = SetupJob<FlmPlan> & { kind: 'fastflowlm-model' }
export class FlmSetups {
  readonly journal: SetupJournal<FlmPlan, FlmJob>
  readonly mutations: FlmMutations
  private readonly writes = new SerialWork()
  constructor(
    private o: WorkspaceServiceOptions,
    private downloader: Pick<Downloader, 'download' | 'cancel'>
  ) {
    this.mutations = new FlmMutations(o)
    this.journal = new SetupJournal({
      directory: join(o.paths.atcDir, 'fastflowlm-model-setups'),
      kind: 'fastflowlm-model',
      policy: { awaitWorkerOnCancel: true, recordTransferred: true, awaitCancelledBeforeInstall: true },
      reviewFirst: 'Review a FastFlowLM model download first.',
      noSuch: 'No such FastFlowLM download.',
      hasPlan: (p) => {
        try {
          parseFastFlowLmDescriptor(p.record)
          return true
        } catch {
          return false
        }
      },
      isInstalled: (p) =>
        new FastFlowLmRegistry(o.paths.layout).get(p.variant_id).then(
          (m) => m.yml.fastflowlm.catalog_digest === p.catalog_digest,
          () => false
        ),
      downloader,
      run: (job, worker) => this.writes.run(job.plan.variant_id, () => this.run(job, worker)),
    })
  }
  plan(model: string, refresh = false, variant?: string) {
    return flmPlan(this.o, model, refresh, variant).then((p) => this.journal.record(p))
  }
  discard(id: string) {
    return this.journal.remove(id, (job) =>
      this.writes.run(job.plan.variant_id, async () => {
        if (job.stage === 'ready')
          throw new AtcError('ATC_USAGE', 'Delete installed models from Installed models.')
        const shared = (await this.journal.list()).some(
          (other) => other.id !== id && other.plan.digest === job.plan.digest
        )
        if (!shared)
          await rm(join(this.o.paths.dataFolder, 'fastflowlm', 'transfers', job.plan.digest), {
            recursive: true,
            force: true,
          })
      })
    )
  }
  remove(id: string) {
    return this.writes.run(id, () => this.mutations.remove(id))
  }
  private async run(job: FlmJob, worker: { cancelled: boolean }) {
    const plan = job.plan
    const root = join(this.o.paths.dataFolder, 'fastflowlm', 'transfers', plan.digest)
    const layout = dataLayout(root)
    const stage = join(layout.provider('fastflowlm').modelsDir, plan.variant_id)
    try {
      await this.mutations.recoverModel(plan.variant_id)
      const installed = await new FastFlowLmRegistry(this.o.paths.layout)
        .get(plan.variant_id)
        .catch(() => undefined)
      if (installed?.yml.fastflowlm.catalog_digest === plan.catalog_digest) {
        await this.journal.write(job, 'ready')
        return
      }
      const record = parseFastFlowLmDescriptor(plan.record)
      const check = await this.o.link.request<FastFlowLmCheckResult>('POST', '/models/fastflowlm/check', {
        descriptor: record,
      })
      if (check.verdict !== 'ok') throw new Error(check.reason ?? check.verdict)
      const token = this.o.env?.HF_TOKEN
      if (plan.gated && !token)
        throw new Error('Set HF_TOKEN on the server after accepting the model license.')
      await this.journal.step(job, worker, 'downloading')
      if (worker.cancelled) return
      await mkdir(stage, { recursive: true })
      // core-boundary: model.yml — completion marker is written last in an isolated staging layout.
      await rm(join(stage, 'model.yml'), { force: true })
      const proxy = downloadProxy(this.o.config)
      await this.downloader.download(
        job.id,
        record.files.map((f) => {
          const source = record.sources.find((s) => s.id === f.source)!
          const path = f.source_path.split('/').map(encodeURIComponent).join('/')
          const url =
            source.host === 'github'
              ? `https://raw.githubusercontent.com/${source.repo}/${source.revision}/${path}`
              : `https://huggingface.co/${source.repo}/resolve/${source.revision}/${path}`
          return {
            url,
            size: f.size,
            sha256: f.sha256,
            save_path: join(stage, f.path),
            ...(proxy ? { proxy } : {}),
          }
        }),
        { resume: true, wrapFetch: (base) => hubAuthorized(base, 'https://huggingface.co', token) }
      )
      await this.journal.step(job, worker, 'verifying')
      if (worker.cancelled) return
      const metadata: ModelYmlFastFlowLm = {
        ...record,
        schema_version: 1,
        catalog_digest: plan.catalog_digest,
        model_list_path: FLM_MODEL_LIST_PATH,
        model_info_path: FLM_MODEL_INFO_PATH,
      }
      const config = buildFastFlowLmConfig(metadata)
      await writeDocument(join(stage, FLM_MODEL_LIST_PATH), config.modelList)
      await writeDocument(join(stage, FLM_MODEL_INFO_PATH), config.modelInfo)
      await nodeStoreFiles.writeAtomic(
        join(stage, 'model.yml'),
        serializeModelYml({
          name: plan.name,
          model_path: `fastflowlm/models/${record.variant_id}`,
          size_bytes: plan.download_bytes,
          fastflowlm: metadata,
        })
      )
      // The downloader verified SHA-256; now check structure/config without rereading staged payloads.
      await new FastFlowLmRegistry(layout).get(record.variant_id)
      if (worker.cancelled) return
      await this.mutations.replace(plan, stage)
      await this.journal.write(job, 'ready')
      await rm(root, { recursive: true, force: true })
    } catch (e) {
      await this.journal.step(job, worker, 'failed', e)
    }
  }
}
