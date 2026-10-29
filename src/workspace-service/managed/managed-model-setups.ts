/**
 * Durable downloads into the managed engines' shared store (design D6, after `ArtifactService`): a
 * reviewed plan by its digest, then a job under the caller's request id that downloads the missing
 * files with the server's downloader (the store's root as an extra allowed root), writes `model.yml`
 * last — only once every file is verified — and checks that the core then lists the model. A job that
 * was running when the server stopped reads as `interrupted`; the same request id continues it.
 */

import type { ManagedModelJob, ManagedModelPlan, WorkspaceInput } from '../../contract/index.js'
import type { Downloader, ProxyConfig } from '../../downloads/index.js'
import { resolveUrl } from '../models/hf-revision.js'
import { SetupJournal } from '../setup-journal.js'
import { modelIdPath, segment } from '../validation.js'
import { managedModelPlan, nodeStoreFiles, underRoot } from './managed-model-plan.js'
import type { StoreFiles } from './managed-model-plan.js'
import type { ManagedModelDeps } from './managed-models.js'
import { hubOf } from './managed-models.js'

export type { StoreFiles } from './managed-model-plan.js'

export interface ManagedModelSetupsDeps extends ManagedModelDeps {
  /** `<atc>/managed-model-setups`: one record per plan digest and per request id. */
  directory: string
  downloader: Pick<Downloader, 'download' | 'cancel'> & Partial<Pick<Downloader, 'snapshot'>>
  files?: StoreFiles
  proxy?: ProxyConfig | null | undefined
}

export class ManagedModelSetups {
  private readonly files: StoreFiles
  readonly directory: string
  private readonly journal: SetupJournal<ManagedModelPlan, ManagedModelJob>
  constructor(private readonly d: ManagedModelSetupsDeps) {
    this.files = d.files ?? nodeStoreFiles
    this.directory = d.directory
    this.journal = new SetupJournal({
      directory: d.directory,
      kind: 'managed-model',
      policy: {
        awaitWorkerOnCancel: true,
        recordTransferred: true,
        awaitCancelledBeforeInstall: false,
      },
      reviewFirst: 'Review the download with managed.plan first.',
      noSuch: 'No such model download.',
      hasPlan: (plan) => !!plan.files,
      downloader: d.downloader,
      run: (job, worker) => this.run(job, worker),
    })
  }

  async plan(input: { repository: string; revision?: string; engine: string }): Promise<ManagedModelPlan> {
    const plan = await managedModelPlan({ ...this.d, files: this.files }, input)
    return this.journal.record(plan)
  }

  /** Every job, a running one without its worker (the server restarted) as `interrupted`. */
  list(): Promise<ManagedModelJob[]> {
    return this.journal.list()
  }

  install(input: WorkspaceInput): Promise<ManagedModelJob> {
    return this.journal.install(input)
  }

  cancel(id: string): Promise<ManagedModelJob> {
    return this.journal.cancel(id)
  }

  remove(id: string, cleanup: (job: ManagedModelJob) => Promise<void>) {
    return this.journal.remove(id, cleanup)
  }

  private async run(job: ManagedModelJob, worker: { cancelled: boolean }): Promise<void> {
    const { plan } = job
    const token = this.d.env?.['HF_TOKEN']
    try {
      if (!plan.present) {
        await this.journal.step(job, worker, 'downloading')
        if (worker.cancelled) return void (await this.journal.step(job, worker, 'cancelled'))
        const items = plan.files.map((f) => ({
          url: resolveUrl(plan.repository, plan.revision, f.path, hubOf(this.d.env)),
          save_path: underRoot(plan.root, plan.repository, f.path),
          size: f.size,
          sha256: f.sha256,
          ...(this.d.proxy ? { proxy: this.d.proxy } : {}),
        }))
        await this.d.downloader.download(job.id, items, {
          resume: true,
          allowedRoots: [plan.root],
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        })
        if (worker.cancelled) return void (await this.journal.step(job, worker, 'cancelled'))
        await this.journal.step(job, worker, 'verifying')
        // Last: this file is what turns the folder into a model for the core (JSON is YAML to its parser).
        const yml = {
          repository: plan.repository,
          revision: plan.revision,
          architectures: plan.architectures,
          files: plan.files,
        }
        await this.files.writeAtomic(
          // core-boundary: model.yml — atc downloads checkpoints into the core's store and writes it last (ADR 2026-10-20-download-managed-models-in-atc)
          underRoot(plan.root, plan.repository, 'model.yml'),
          `${JSON.stringify(yml, null, 2)}\n`
        )
      }
      await this.d.link
        .request('GET', `/models/${segment(plan.engine)}/${modelIdPath(plan.repository)}/capabilities`)
        .catch((error: unknown) => {
          throw new Error(
            `The core does not list ${plan.repository} after model.yml was written; its files stay in ${plan.root} (${error instanceof Error ? error.message : String(error)}).`
          )
        })
      await this.journal.step(job, worker, 'ready')
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      await this.journal
        .step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error)
        .catch(() => {})
    }
  }
}
