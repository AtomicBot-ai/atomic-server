import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GeniexCheckResult } from '@atomic-chat/core/contracts'
import { ModelRegistry, serializeModelYml } from '@atomic-chat/core/models'
import type { Downloader } from '../../downloads/index.js'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { SetupJournal, type SetupJob } from '../setup-journal.js'
import { SerialWork } from '../serial.js'
import { nodeStoreFiles } from '../managed/managed-model-plan.js'
import { hubAuthorized } from '../models/hub-fetch.js'
import { HF_HUB } from '../models/hf-revision.js'
import { downloadProxy } from '../models/download-proxy.js'
import { genieCatalog, type GenieVariant } from './catalog.js'
import { unpackBundle } from './bundle.js'

async function planDownload(o: WorkspaceServiceOptions, model: string, choice?: string) {
  let row = (await genieCatalog(o, model, false)).models.find(
    (m) => m.model_id === model || m.variants.some((v) => v.id === model)
  )
  if (!row && model.includes('/'))
    row = (await genieCatalog(o, model, true)).models.find((m) => m.model_id === model)
  if (!row)
    throw new AtcError('ATC_USAGE', 'No matching GenieX model. See atc models search --engine geniex.')
  const selected = choice ?? (row.model_id !== model ? model : row.default_variant)
  const variant = selected
    ? row.variants.find((v) => v.id === selected || v.backend === selected)
    : row.variants[0]
  if (!variant) throw new AtcError('ATC_USAGE', 'No matching GenieX device or chip variant.')
  const blockers: string[] = []
  if (variant.verdict.verdict !== 'ok') blockers.push(variant.verdict.reason ?? variant.verdict.verdict)
  if (row.gated && !o.env?.HF_TOKEN)
    blockers.push(`Accept the terms at ${HF_HUB}/${variant.record.repo} and set HF_TOKEN on the server.`)
  const root = o.paths.layout.provider('geniex').modelsDir
  const free = await o.link.disk.available(root).catch(() => null)
  if (free !== null && free < variant.size_bytes * (variant.record.plugin === 'qairt' ? 2 : 1))
    blockers.push('Not enough free space for this model.')
  const data = {
    variant_id: variant.record.variant_id,
    model_id: row.model_id,
    name: row.name,
    gated: row.gated,
    download_bytes: variant.size_bytes,
    variant,
    dir: join(root, variant.record.variant_id),
    blockers,
  }
  return { ...data, digest: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
}
export type GeniePlan = Awaited<ReturnType<typeof planDownload>>
export type GenieJob = SetupJob<GeniePlan> & { kind: 'geniex-model' }

export class GenieSetups {
  readonly journal: SetupJournal<GeniePlan, GenieJob>
  private readonly writes = new SerialWork()
  constructor(
    private o: WorkspaceServiceOptions,
    private downloader: Pick<Downloader, 'download' | 'cancel'>
  ) {
    this.journal = new SetupJournal({
      directory: join(o.paths.atcDir, 'geniex-model-setups'),
      kind: 'geniex-model',
      policy: { awaitWorkerOnCancel: true, recordTransferred: false, awaitCancelledBeforeInstall: true },
      reviewFirst: 'Review a GenieX download first.',
      noSuch: 'No such GenieX download.',
      hasPlan: (p) => !!p.variant?.record,
      isInstalled: async (plan) =>
        (await new ModelRegistry(o.paths.layout, 'geniex').find(plan.variant_id))?.yml
          .atomic_install_digest === plan.digest,
      downloader,
      run: (job, worker) => this.writes.run(job.plan.variant_id, () => this.run(job, worker)),
    })
  }
  async plan(model: string, choice?: string) {
    return this.journal.record(await planDownload(this.o, model, choice))
  }
  private async check(v: GenieVariant, path?: string) {
    const r = await this.o.link.request<GeniexCheckResult>('POST', '/models/geniex/check', {
      plugin: v.record.plugin,
      device: v.backend,
      ...(v.record.chip ? { chip: v.record.chip } : {}),
      ...(v.min_runtime_version ? { min_runtime_version: v.min_runtime_version } : {}),
      ...(path ? { path } : {}),
    })
    if (r.verdict !== 'ok') throw new Error(r.reason ?? r.verdict)
    return r.metadata
  }
  private async run(job: GenieJob, worker: { cancelled: boolean }) {
    const { plan } = job,
      v = plan.variant,
      record = { ...v.record }
    const bundle = record.plugin === 'qairt'
    const root = dirname(plan.dir)
    const cache = join(dirname(root), 'transfers', plan.digest)
    const proxy = downloadProxy(this.o.config)
    const stage = join(root, '.stage-' + plan.digest)
    const publish = join(cache, 'publish')
    const registry = new ModelRegistry(this.o.paths.layout, 'geniex')
    try {
      await this.journal.step(job, worker, 'downloading')
      if (worker.cancelled) return
      const installed = await registry.find(plan.variant_id)
      if (installed) {
        if (installed.yml.atomic_install_digest !== plan.digest)
          throw new Error('A different installation of this model already exists.')
        await this.journal.write(job, 'ready')
        return
      }
      await this.check(v)
      await mkdir(cache, { recursive: true })
      // Recover a checked folder left between staging and atomic publication.
      if (
        await stat(publish).then(
          () => true,
          () => false
        )
      ) {
        // core-boundary: model.yml — never expose a staging registration to the core's recursive registry scan.
        await rm(join(publish, 'model.yml'), { force: true })
        if (bundle) await rm(publish, { recursive: true, force: true })
        else await rename(publish, stage)
      }
      const token = this.o.env?.HF_TOKEN
      if (plan.gated && !token)
        throw new Error(`Accept the model terms at ${HF_HUB}/${record.repo} and set HF_TOKEN on the server.`)
      await this.downloader.download(
        job.id,
        v.files.map((f) => ({
          url: f.url,
          size: f.size,
          sha256: f.sha256,
          save_path: join(bundle ? cache : stage, f.name),
          ...(proxy ? { proxy } : {}),
        })),
        { resume: true, ...(!bundle ? { wrapFetch: (base) => hubAuthorized(base, HF_HUB, token) } : {}) }
      )
      await this.journal.step(job, worker, 'verifying')
      let bytes = v.size_bytes
      let path = join(stage, record.file ?? '')
      if (bundle) {
        await rm(stage, { recursive: true, force: true })
        await mkdir(stage, { recursive: true })
        const unpacked = await unpackBundle(join(cache, 'bundle.zip'), stage, () => worker.cancelled)
        bytes = unpacked.bytes
        path = unpacked.dir
      }
      if (worker.cancelled) return
      const metadata = await this.check(v, path).catch(async (error) => {
        await rm(stage, { recursive: true, force: true })
        throw error
      })
      if (worker.cancelled) throw new Error('Download cancelled.')
      if (metadata?.kind === 'gguf' && record.source === 'huggingface') {
        record.context_length = metadata.max_context_tokens ?? 4096
        record.vision = !!record.mmproj || metadata.vision
      }
      if (metadata?.kind === 'qairt' && metadata.precision) record.precision = metadata.precision
      await rename(bundle ? path : stage, publish)
      const relative = `geniex/models/${plan.variant_id}`
      // core-boundary: model.yml — the server publishes the core's serialized registration after checking all files.
      await nodeStoreFiles.writeAtomic(
        join(publish, 'model.yml'),
        serializeModelYml({
          name: plan.name,
          size_bytes: bytes,
          model_path: record.file ? `${relative}/${record.file}` : relative,
          ...(record.mmproj ? { mmproj_path: `${relative}/${record.mmproj}` } : {}),
          geniex: record,
          atomic_install_digest: plan.digest,
        })
      )
      if (worker.cancelled) return
      await rename(publish, plan.dir)
      await rm(cache, { recursive: true, force: true })
      await this.journal.write(job, 'ready')
    } catch (error) {
      let failure = error
      if (!bundle && /HTTP status 40[13]\b/.test(String(error))) {
        await rm(stage, { recursive: true, force: true })
        failure = new Error(
          `Hugging Face refused ${record.repo}. Accept the model terms and set HF_TOKEN on the server.`
        )
      }
      await this.journal.step(job, worker, worker.cancelled ? 'cancelled' : 'failed', failure)
    } finally {
      if (bundle) await rm(stage, { recursive: true, force: true })
    }
  }
}
