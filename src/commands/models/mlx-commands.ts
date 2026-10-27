/**
 * `atc models pull <model> --engine mlx` and `atc run <model> --engine mlx`: the MLX checkpoint the web
 * admin and the terminal UI install (`artifacts.plan` → `artifacts.install`, the server's own job) and
 * load (`artifacts.load`, which registers the checkpoint for every later `atc run`). The catalog names
 * the checkpoints; a repository outside it has no plan.
 */

import { randomUUID } from 'node:crypto'
import { AtcError } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import type { WorkspaceClient } from '../../workspace-service/index.js'
import { printOperation, workspace } from '../server/control.js'
import { follow, followDisplay } from './follow.js'

interface ArtifactJob {
  id: string
  stage: string
  error?: string
  plan: { engine: string; model_id: string; name: string }
}

const FINISHED = ['ready', 'failed', 'cancelled', 'interrupted']

export async function pullMlxModel(
  ctx: CommandContext,
  model: string,
  values: Record<string, unknown>
): Promise<number> {
  const service = await workspace(ctx)
  const plan = (await service
    .execute('artifacts.plan', { category: 'text', model_id: model })
    .catch((e: unknown) => {
      if (e instanceof AtcError && e.code === 'ATC_USAGE' && /current catalog/.test(e.message))
        throw new AtcError('ATC_USAGE', `${model} is not an MLX checkpoint of the catalog.`, {
          hint: 'choose one from: atc models catalog --engine mlx',
        })
      throw e
    })) as { digest: string; blockers?: string[] }
  if (values['dry-run']) return printOperation(ctx, 'artifacts.plan', plan)
  if (plan.blockers?.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
  const id = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  await service.execute('artifacts.install', { plan_digest: plan.digest, request_id: id })
  if (values['detach']) return printOperation(ctx, 'artifacts.install', { id, plan_digest: plan.digest })
  return followArtifact(ctx, service, id, model)
}

/** One poll of the job: its stage, and its bytes from the server's downloader. */
async function jobState(service: WorkspaceClient, id: string) {
  const [jobs, snapshot] = await Promise.all([
    service.execute('artifacts.list') as Promise<ArtifactJob[]>,
    service.snapshot(),
  ])
  const job = jobs.find((j) => j.id === id)
  if (!job) throw new AtcError('ATC_USAGE', `No download ${id}.`)
  const bytes = (snapshot.downloads as Array<{ taskId?: string; transferred: number; total: number }>).find(
    (d) => d.taskId === id
  )
  return { ...job, transferred: bytes?.transferred ?? null, total: bytes?.total ?? null }
}

async function followArtifact(ctx: CommandContext, service: WorkspaceClient, id: string, model: string) {
  const interrupt = new AbortController()
  const off = ctx.io.onInterrupt?.(() => interrupt.abort()) ?? (() => {})
  const display = followDisplay<Awaited<ReturnType<typeof jobState>>>(
    { io: ctx.io, progress: ctx.progress, flags: ctx.flags },
    (j) => ({ stage: j.stage, text: `${model}: ${j.stage}`, done: j.transferred, total: j.total })
  )
  try {
    const result = await follow({
      pick: () => undefined,
      poll: () => jobState(service, id),
      finished: (j) => FINISHED.includes(j.stage),
      show: (j) => display.show(j),
      signal: AbortSignal.any([ctx.signal, interrupt.signal]),
      pollMs: 1000,
    })
    display.close(result.value.stage === 'ready')
    if (result.kind === 'detached') {
      ctx.out.line(`${id} goes on in the server; cancel it with: atc models pull --engine mlx --cancel ${id}`)
      return 130
    }
    if (result.value.stage !== 'ready')
      throw new AtcError('ATC_USAGE', `The download of ${model} ended ${result.value.stage}.`, {
        ...(result.value.error ? { details: result.value.error } : {}),
        hint: `continue it with: atc models pull ${model} --engine mlx --request-id ${id}`,
      })
    ctx.out.line(`${model} is downloaded; run it with: atc run ${model} --engine mlx`)
    return 0
  } finally {
    off()
  }
}

/**
 * A downloaded MLX checkpoint the server never loaded is not yet a registered model: `artifacts.load`
 * registers it and loads it. `false` when no such checkpoint is ready, and the usual load applies.
 */
export async function loadMlxArtifact(service: WorkspaceClient, model: string): Promise<boolean> {
  const jobs = (await service.execute('artifacts.list')) as ArtifactJob[]
  const job = jobs.find((j) => j.plan.engine === 'mlx' && j.plan.model_id === model && j.stage === 'ready')
  if (!job) return false
  await service.execute('artifacts.load', { id: job.id })
  return true
}
