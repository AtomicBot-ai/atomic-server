import { StrataPreparationFailed } from './preparation.js'
import { lstat, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { StrataMaintenance as Guard, StrataMaintenanceRequest } from '@atomic-chat/core/contracts'
import { ModelRegistry } from '@atomic-chat/core/models'
import { AtcError } from '../../errors/index.js'
import { readDocument, replaceFile, writeDocument } from '../../terminal-data/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'

const route = '/models/strata/maintenance'
export const STRATA_OWNED_FILE = '.atc-strata.json'

type Mutation = {
  request: StrataMaintenanceRequest
  jobId?: string
  rolledBack?: boolean
}

async function exists(path: string) {
  try {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe Strata model directory.')
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export class StrataMaintenance {
  constructor(private readonly options: WorkspaceServiceOptions) {}

  private paths(id: string) {
    if (!/^[a-z0-9][a-z0-9._-]{0,179}$/i.test(id)) throw new AtcError('ATC_USAGE', 'Invalid Strata model ID.')
    const { paths } = this.options
    const provider = paths.layout.provider('strata')
    return {
      target: join(provider.modelsDir, id),
      backup: join(provider.root, 'recovery', id),
      state: join(paths.atcDir, 'strata-maintenance', id + '.json'),
    }
  }

  async pending(modelId: string) {
    return Boolean(await readDocument<Mutation | null>(this.paths(modelId).state, null))
  }

  private async assertOwned(target: string, id: string) {
    if (!(await exists(target))) throw new AtcError('ATC_USAGE', 'This Strata model is not installed.')
    const owner = await readDocument<{ model_id: string } | null>(join(target, STRATA_OWNED_FILE), null)
    if (owner?.model_id !== id)
      throw new AtcError('ATC_USAGE', 'This Strata model directory is managed by another installation.')
  }

  private async begin(mutation: Mutation) {
    const guard = await this.options.link.request<Guard>('POST', route, mutation.request)
    if (guard.state !== 'completed' && !guard.ready_to_mutate)
      throw new Error('Strata did not confirm that the model stopped.')
    return guard
  }

  private async finish(guard: Guard, paths: ReturnType<StrataMaintenance['paths']>) {
    if (guard.state !== 'completed')
      await this.options.link.request(
        'POST',
        route + '/' + encodeURIComponent(guard.operation_id) + '/complete',
        {}
      )
    await rm(paths.backup, { recursive: true, force: true })
    await rm(paths.state, { force: true })
  }

  async replaceIfNeeded(
    id: string,
    jobId: string,
    digest: string,
    stage: string,
    hasDifferentInstall: boolean,
    prepare: (guard: string) => Promise<void>
  ) {
    const p = this.paths(id)
    let mutation = await readDocument<Mutation | null>(p.state, null)
    if (mutation?.request.action === 'remove' || (mutation && mutation.jobId !== jobId))
      throw new AtcError('ATC_USAGE', 'Finish the previous Strata maintenance operation first.')
    if (!mutation && !hasDifferentInstall) return false
    if (!mutation) {
      await this.assertOwned(p.target, id)
      mutation = {
        request: {
          request_id: 'atc-strata-maintenance-' + crypto.randomUUID(),
          model_id: id,
          action: 'replace',
          target_source_digest: digest,
        },
        jobId,
      }
      await writeDocument(p.state, mutation)
    }
    const guard = await this.begin(mutation)
    if (mutation.rolledBack || guard.state === 'completed') {
      await this.finish(guard, p)
      if (mutation.rolledBack)
        throw new AtcError('ATC_USAGE', 'The previous Strata installation was restored. Retry to replace it.')
      return true
    }
    const existingDigest = async () =>
      (await new ModelRegistry(this.options.paths.layout, 'strata').find(id))?.yml.strata?.source_digest
    try {
      if ((await existingDigest()) !== digest) {
        if (!(await exists(p.backup))) {
          await this.assertOwned(p.target, id)
          await mkdir(dirname(p.backup), { recursive: true })
          await replaceFile(p.target, p.backup)
        }
        if (await exists(p.target)) throw new Error('Both Strata install and backup need recovery.')
        await replaceFile(stage, p.target)
      }
      await prepare(guard.operation_id)
    } catch (error) {
      if (!(error instanceof StrataPreparationFailed)) throw error
      // A crashed server leaves the guard and both directories in place for the same request ID.
      // A confirmed preparation failure restores the previous directory while the guard holds load.
      if (await exists(p.backup)) {
        if ((await existingDigest()) === digest) await replaceFile(p.target, stage)
        if (!(await exists(p.target))) await replaceFile(p.backup, p.target)
      }
      mutation.rolledBack = true
      await writeDocument(p.state, mutation)
      await this.finish(guard, p)
      throw error
    }
    await this.finish(guard, p)
    return true
  }

  async remove(id: string) {
    const p = this.paths(id)
    let mutation = await readDocument<Mutation | null>(p.state, null)
    if (mutation?.request.action === 'replace')
      throw new AtcError('ATC_USAGE', 'Finish the Strata replacement before deleting this model.')
    if (!mutation) {
      await this.assertOwned(p.target, id)
      mutation = {
        request: { request_id: 'atc-strata-remove-' + crypto.randomUUID(), action: 'remove', model_id: id },
      }
      await writeDocument(p.state, mutation)
    }
    const guard = await this.begin(mutation)
    if (guard.state !== 'completed' && (await exists(p.target))) {
      if (await exists(p.backup)) throw new Error('Both Strata install and backup need recovery.')
      await mkdir(dirname(p.backup), { recursive: true })
      await replaceFile(p.target, p.backup)
    }
    await this.finish(guard, p)
    return { removed: true, model_id: id }
  }
}
