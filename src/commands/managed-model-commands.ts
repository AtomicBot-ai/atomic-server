/**
 * The `atc models` subcommands for the managed engines' checkpoints (spec `managed-models-server`):
 * the core's verdict before any download.
 */

import { randomUUID } from 'node:crypto'
import { AtomicCoreError } from '@atomic-chat/core'
import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import type { ManagedModelPlan, ModelCheckResult } from '../contract/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { formatSize, verdictLine } from '../workspace-view/index.js'
import { workspace } from './control.js'
import { follow, followDisplay } from './follow.js'

export const checkModelCommand = defineCommand({
  name: 'check',
  summary: "Each managed engine's verdict on a Hugging Face model, before downloading it",
  positionals: [{ name: 'repo', description: 'owner/repo[@revision]', required: true }],
  options: { engine: { type: 'string', description: 'Only this managed engine', placeholder: 'engine' } },
  examples: [
    'atc models check Qwen/Qwen3.5-2B',
    'atc models check nvidia/Qwen3-8B-FP8@main --engine tensorrt-llm',
  ],
  run: async (inv, ctx) => {
    const [repository, revision] = splitRevision(inv.positionals[0]!)
    const result = (await (
      await workspace(ctx)
    ).execute('models.check', {
      repository,
      ...(revision ? { revision } : {}),
      ...(typeof inv.values['engine'] === 'string' ? { engine: inv.values['engine'] } : {}),
    })) as ModelCheckResult
    ctx.out.result(result, () => {
      ctx.out.note(`${result.repository} at ${result.revision}`)
      for (const v of result.verdicts) ctx.out.line(verdictLine(v))
    })
    return 0
  },
})

/** `owner/repo@revision` → the repository and the revision, when there is one. */
export function splitRevision(ref: string): [string, string | undefined] {
  const at = ref.lastIndexOf('@')
  return at > 0 ? [ref.slice(0, at), ref.slice(at + 1)] : [ref, undefined]
}

const FINISHED = ['ready', 'failed', 'cancelled', 'interrupted']

/** What one poll of a download job shows: the job, and its bytes from the server's downloader. */
async function jobState(service: WorkspaceClient, kind: string, id: string) {
  const snapshot = await service.snapshot()
  const job = (snapshot.setups as Array<{ kind?: string; id: string; stage: string; error?: string }>).find(
    (j) => j?.kind === kind && j.id === id
  )
  if (!job) throw new AtcError('ATC_USAGE', `No download ${id}.`)
  const bytes = (snapshot.downloads as Array<{ taskId?: string; transferred: number; total: number }>).find(
    (d) => d.taskId === id
  )
  return { ...job, transferred: bytes?.transferred ?? null, total: bytes?.total ?? null }
}

/**
 * Follow a download job the server runs (a managed model's, a Foundry Local variant's) until it ends;
 * Ctrl-C only stops the following. Exit 0 once it is ready.
 */
export async function followSetup(
  ctx: CommandContext,
  service: WorkspaceClient,
  job: { kind: string; id: string; label: string; cancel: string; retry: string }
): Promise<number> {
  const interrupt = new AbortController()
  const off = ctx.io.onInterrupt?.(() => interrupt.abort()) ?? (() => {})
  const display = followDisplay<Awaited<ReturnType<typeof jobState>>>(
    { io: ctx.io, progress: ctx.progress, flags: ctx.flags },
    (j) => ({ stage: j.stage, text: `${job.label}: ${j.stage}`, done: j.transferred, total: j.total })
  )
  try {
    const result = await follow({
      pick: () => undefined,
      poll: () => jobState(service, job.kind, job.id),
      finished: (j) => FINISHED.includes(j.stage),
      show: (j) => display.show(j),
      signal: AbortSignal.any([ctx.signal, interrupt.signal]),
      pollMs: 1000,
    })
    display.close(result.value.stage === 'ready')
    if (result.kind === 'detached') {
      ctx.out.line(`${job.id} goes on in the server; cancel it with: ${job.cancel}`)
      return 130
    }
    if (result.value.stage !== 'ready')
      throw new AtcError('ATC_USAGE', `The download of ${job.label} ended ${result.value.stage}.`, {
        ...(result.value.error ? { details: result.value.error } : {}),
        hint: `continue it with: ${job.retry}`,
      })
    return 0
  } finally {
    off()
  }
}

/** `atc models pull <repo> --engine <managed>`: the plan, then the download in the server, followed. */
export async function pullManagedModel(
  ctx: CommandContext,
  ref: string,
  engine: string,
  values: Record<string, unknown>
): Promise<number> {
  const [repository, revision] = splitRevision(ref)
  const service = await workspace(ctx)
  const plan = (await service.execute('managed.plan', {
    repository,
    engine,
    ...(revision ? { revision } : {}),
  })) as ManagedModelPlan
  if (values['dry-run']) {
    ctx.out.result(plan, () => printPlan(ctx, plan))
    return 0
  }
  if (!ctx.flags.json) printPlan(ctx, plan)
  const refusal = plan.verdict.compatibility?.verdict
  if (refusal && !refusal.ok) throw AtomicCoreError.fromBody(refusal.error)
  if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
  const id = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  await service.execute('managed.install', { request_id: id, plan_digest: plan.digest })
  if (values['detach']) {
    ctx.out.result({ id, stage: 'queued' }, () => {
      ctx.out.line(`Downloading in the server as ${id}.`)
      ctx.out.line(`Cancel it with: atc models pull --cancel ${id}`)
    })
    return 0
  }
  const code = await followSetup(ctx, service, {
    kind: 'managed-model',
    id,
    label: plan.repository,
    cancel: `atc models pull --cancel ${id}`,
    retry: `atc models pull ${ref} --engine ${engine} --request-id ${id}`,
  })
  if (code === 0) ctx.out.line(`${plan.repository} is in the store for every managed engine.`)
  return code
}

function printPlan(ctx: CommandContext, plan: ManagedModelPlan): void {
  ctx.out.line(`${plan.repository} at ${plan.revision}`)
  ctx.out.line(verdictLine(plan.verdict))
  if (plan.present) ctx.out.line(`Already in the store at ${plan.root}.`)
  else
    ctx.out.line(
      `${plan.pending.length} of ${plan.files.length} files to download, ${formatSize(plan.download_bytes)}${plan.free_bytes !== null ? `, ${formatSize(plan.free_bytes)} free` : ''} in ${plan.root}`
    )
  for (const blocker of plan.blockers) ctx.out.line(`  - ${blocker}`)
}

/**
 * `atc models pull <repo>` of a repository without GGUF files (spec "Подсказка для репозитория без
 * GGUF"): name the installed managed engines that take its safetensors checkpoint, never download.
 */
export async function noGgufHint(
  ctx: CommandContext,
  service: WorkspaceClient,
  repository: string
): Promise<never> {
  const check = (await service.execute('models.check', { repository }).catch(() => undefined)) as
    ModelCheckResult | undefined
  const accepting = (check?.verdicts ?? []).filter((v) => v.compatibility?.verdict.ok)
  const installed = accepting.filter((v) => v.installed)
  if (installed.length)
    throw new AtcError('ATC_USAGE', `${repository} has no GGUF file; a managed engine runs it.`, {
      hint: installed.map((v) => `atc models pull ${repository} --engine ${v.engine}`).join(' or '),
    })
  if (accepting.length)
    throw new AtcError(
      'ATC_USAGE',
      `${repository} has no GGUF file; ${accepting.map((v) => v.engine).join(', ')} would run it.`,
      {
        hint: `install one first: atc engines install ${accepting[0]!.engine}`,
      }
    )
  throw new AtcError('ATC_USAGE', `${repository} has no GGUF file, and no managed engine here takes it.`, {
    ...(check ? { details: check.verdicts.map(verdictLine).join('; ') } : {}),
    hint: `see atc models check ${repository}`,
  })
}

interface Listing {
  engine: string
  descriptor_id: string
  models?: Array<{ repository: string; revision: string; note: string; vram_tier_bytes: number }>
  rows?: Array<{
    repository: string
    section: string
    architectures: string[]
    weight_bytes_estimate: number | null
  }>
}

/** `atc models catalog|search --engine <managed>`: the descriptor's curated models, the narrowed Hub. */
export async function managedListing(ctx: CommandContext, name: string, input: Record<string, unknown>) {
  const result = (await (await workspace(ctx)).execute(name, input)) as Listing
  ctx.out.result(result, () => {
    ctx.out.note(`${result.engine}, descriptor ${result.descriptor_id}`)
    for (const m of result.models ?? [])
      ctx.out.line(
        `${m.repository}@${m.revision.slice(0, 12)}  ${formatSize(m.vram_tier_bytes)} card — ${m.note}`
      )
    for (const r of result.rows ?? []) {
      const size = r.weight_bytes_estimate !== null ? `~${formatSize(r.weight_bytes_estimate)}` : ''
      ctx.out.line(
        `${r.repository}  ${r.section}  ${[r.architectures.join(','), size].filter(Boolean).join('  ')}`
      )
    }
  })
  return 0
}
