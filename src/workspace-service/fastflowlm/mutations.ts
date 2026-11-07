import { mkdir, readdir, rm, lstat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { isFastFlowLmVariantId } from '@atomic-chat/core/client'
import { FastFlowLmRegistry } from '@atomic-chat/core/models'
import type { FastFlowLmCheckResult, FastFlowLmMaintenanceResult } from '@atomic-chat/core/contracts'
import { readDocument, writeDocument, replaceFile } from '../../terminal-data/index.js'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { SerialWork } from '../serial.js'
import type { FlmPlan } from './catalog.js'

interface Mutation {
  model: string
  kind: 'replace' | 'remove'
  request_id: string
  digest?: string
  stage?: string
  had_previous: boolean
  accepted: boolean
  rolled_back?: boolean
}
const exists = async (p: string) => {
  try {
    const s = await lstat(p)
    if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Unsafe model directory: ' + p)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}
/** Files belong to atc; the durable core guard prevents loading across every rename and owner restart. */
export class FlmMutations {
  private readonly lanes = new SerialWork()
  readonly directory: string
  constructor(private o: WorkspaceServiceOptions) {
    this.directory = join(o.paths.atcDir, 'fastflowlm-mutations')
  }
  private paths(id: string) {
    if (!isFastFlowLmVariantId(id)) throw new AtcError('ATC_USAGE', 'Invalid FastFlowLM model ID.')
    return {
      target: join(this.o.paths.layout.provider('fastflowlm').modelsDir, id),
      backup: join(this.o.paths.dataFolder, 'fastflowlm', 'recovery', id),
      journal: join(this.directory, id + '.json'),
    }
  }
  replace(plan: FlmPlan, stage: string) {
    return this.lanes.run(plan.variant_id, () => this.replaceLocked(plan, stage))
  }
  private async replaceLocked(plan: FlmPlan, stage: string) {
    const p = this.paths(plan.variant_id)
    const existing = await readDocument<Mutation | null>(p.journal, null)
    if (existing) await this.finish(existing)
    const mutation: Mutation = {
      model: plan.variant_id,
      kind: 'replace',
      request_id: 'atc-flm-' + crypto.randomUUID(),
      digest: plan.catalog_digest,
      stage,
      had_previous: await exists(p.target),
      accepted: false,
    }
    await writeDocument(p.journal, mutation)
    return this.finish(mutation)
  }
  remove(id: string) {
    return this.lanes.run(id, () => this.removeLocked(id))
  }
  private async removeLocked(id: string) {
    const p = this.paths(id)
    const prior = await readDocument<Mutation | null>(p.journal, null)
    if (prior) await this.finish(prior)
    if (!(await exists(p.target))) throw new AtcError('ATC_USAGE', 'This FastFlowLM model is not installed.')
    const mutation: Mutation = {
      model: id,
      kind: 'remove',
      request_id: 'atc-flm-' + crypto.randomUUID(),
      had_previous: true,
      accepted: false,
    }
    await writeDocument(p.journal, mutation)
    await this.finish(mutation)
    return { removed: true, model_id: id }
  }
  recoverModel(id: string) {
    return this.lanes.run(id, async () => {
      const m = await readDocument<Mutation | null>(this.paths(id).journal, null)
      if (m) await this.finish(m)
    })
  }
  async recover() {
    const files = await readdir(this.directory).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    for (const file of files.filter((n) => n.endsWith('.json'))) {
      await this.recoverModel(file.slice(0, -5))
    }
  }
  private async finish(m: Mutation) {
    const p = this.paths(m.model),
      link = this.o.link
    const guard = await link.request<FastFlowLmMaintenanceResult>('POST', '/models/fastflowlm/maintenance', {
      request_id: m.request_id,
      model_id: m.model,
      kind: m.kind,
    })
    if (!guard.ready_to_mutate) {
      const current = await link.request<{ state: string }>(
        'GET',
        '/models/fastflowlm/maintenance/' + encodeURIComponent(guard.operation_id)
      )
      if (current.state !== 'completed' || (!m.accepted && !m.rolled_back))
        throw new Error('FastFlowLM maintenance is still stopping the model.')
      await rm(p.backup, { recursive: true, force: true })
      await rm(p.journal, { force: true })
      return
    }
    let failure: unknown
    if (!m.accepted && !m.rolled_back) {
      try {
        await mkdir(dirname(p.backup), { recursive: true })
        const registry = new FastFlowLmRegistry(this.o.paths.layout)
        const published =
          m.kind === 'replace' &&
          (await registry.get(m.model).then(
            (entry) => entry.yml.fastflowlm.catalog_digest === m.digest,
            () => false
          ))
        if (!published) {
          if (await exists(p.target)) {
            if (await exists(p.backup)) throw new Error('Both old and new model folders need recovery.')
            await replaceFile(p.target, p.backup)
          }
          if (m.kind === 'replace') {
            if (!m.stage) throw new Error('Missing FastFlowLM staging directory.')
            await mkdir(dirname(p.target), { recursive: true })
            await replaceFile(m.stage, p.target)
          }
        }
        if (m.kind === 'replace') {
          await registry.get(m.model)
          const check = await link.request<FastFlowLmCheckResult>('POST', '/models/fastflowlm/check', {
            model_id: m.model,
          })
          if (check.verdict !== 'ok') throw new Error(check.reason ?? check.verdict)
        }
        m.accepted = true
        await writeDocument(p.journal, m)
      } catch (error) {
        failure = error
        if (await exists(p.backup)) {
          await rm(p.target, { recursive: true, force: true })
          await replaceFile(p.backup, p.target)
        } else if (!m.had_previous) await rm(p.target, { recursive: true, force: true })
        m.rolled_back = true
        await writeDocument(p.journal, m)
      }
    }
    await link.request(
      'POST',
      `/models/fastflowlm/maintenance/${encodeURIComponent(guard.operation_id)}/complete`,
      {}
    )
    await rm(p.backup, { recursive: true, force: true })
    await rm(p.journal, { force: true })
    if (failure) throw failure
  }
}
