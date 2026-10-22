/**
 * LiteRT-LM from `atc engines` (spec `litert-lm-server`, "Движок и ускоритель LiteRT-LM в atc"): the
 * accelerator the core offers this machine — `openvino` for an Intel NPU on Windows, nothing elsewhere —
 * and preparing it in the server, followed here by the core's `litert-lm:accelerators` events; and its
 * models from `atc models catalog|search|pull --engine litert-lm`.
 */

import { AtcError } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { randomUUID } from 'node:crypto'
import type { LiteRtAcceleratorsView, LiteRtModelPlan, LiteRtSearchResult } from '../contract/index.js'
import { formatSize, liteRtVariantLabel, liteRtVerdictText } from '../workspace-view/index.js'
import { followPrepare } from './accelerator-prepare.js'
import { attachWorkspace } from './control.js'
import { followSetup } from './managed-model-commands.js'

const NOTHING =
  'LiteRT-LM has nothing to prepare here: its models run on the CPU and GPU without an accelerator.'
const OPS = { status: 'litert.accelerators', prepare: 'litert.prepare', event: 'litert-lm:accelerators' }

/**
 * Prepare `names` (else every accelerator not prepared) and follow it. `quiet`: after an install, where
 * a host with nothing to prepare (Linux, macOS) hears nothing about accelerators at all.
 */
export async function prepareLiteRtAccelerators(
  ctx: CommandContext,
  names: string[] = [],
  quiet = false
): Promise<number> {
  const { link, service } = await attachWorkspace(ctx)
  const view = (await service.execute(OPS.status)) as LiteRtAcceleratorsView
  const offered = view.accelerators.map((a) => a.name)
  const refused = names.filter((n) => !offered.includes(n))
  if (refused.length)
    throw new AtcError('ATC_USAGE', `LiteRT-LM offers no accelerator ${refused.join(', ')} here.`, {
      hint: offered.length ? `prepare one of: ${offered.join(', ')}` : 'nothing here needs preparing',
    })
  const wanted = names.length ? names : view.accelerators.filter((a) => !a.prepared).map((a) => a.name)
  if (wanted.length === 0 && !view.preparing) {
    if (!quiet) ctx.out.line(offered.length ? 'Every accelerator is prepared.' : NOTHING)
    return 0
  }
  return followPrepare<LiteRtAcceleratorsView>(ctx, link, service, OPS, wanted)
}

/** `atc engines accelerators litert-lm`: what the core offers here, prepared or not. */
export async function listLiteRtAccelerators(ctx: CommandContext): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const view = (await service.execute(OPS.status)) as LiteRtAcceleratorsView
  ctx.out.result(view, () => {
    if (view.error) ctx.out.note(view.error)
    if (!view.installed) ctx.out.line('LiteRT-LM is not installed: atc engines install litert-lm')
    ctx.out.line(`NPU: ${view.npu ?? 'none LiteRT-LM targets'}`)
    if (view.accelerators.length)
      ctx.out.table(
        [
          { header: 'ACCELERATOR' },
          { header: 'DEVICE' },
          { header: 'VERSION' },
          { header: 'SIZE' },
          { header: 'PREPARED' },
          { header: 'WHY NOT' },
        ],
        view.accelerators.map((a) => [
          a.name,
          a.device,
          a.version,
          formatSize(a.size_bytes),
          a.prepared ? 'yes' : 'no',
          a.reason ?? '',
        ])
      )
    else if (view.installed) ctx.out.line(NOTHING)
    if (view.preparing) ctx.out.note('a prepare is running in the server')
  })
  return 0
}

/**
 * `atc models catalog --engine litert-lm` (conf's list only) and `atc models search [query] --engine
 * litert-lm` (then Hugging Face): models, their variants here, the core's verdicts.
 */
export async function litertListing(ctx: CommandContext, op: 'models.catalog' | 'models.search', query = '') {
  const { service } = await attachWorkspace(ctx)
  const result = (await service.execute(op, { engine: 'litert-lm', query })) as LiteRtSearchResult
  ctx.out.result(result, () => {
    if (result.list_source !== 'remote' && result.list_error)
      ctx.out.note(
        `conf's LiteRT-LM list could not be read (${result.list_error}); using the ${result.list_source === 'cache' ? 'last copy' : 'bundled list'}`
      )
    if (result.huggingface_unavailable)
      ctx.out.note(
        `Hugging Face is not reachable now (${result.huggingface_error ?? ''}): Atomic Chat's list only`
      )
    if (!result.models.length)
      ctx.out.line(`No LiteRT-LM model for ${result.platform}${query ? ` matches "${query}"` : ''}.`)
    for (const m of result.models) {
      const about = m.unverified
        ? ' — Hugging Face, not verified by Atomic Chat'
        : ` — ${[m.license, m.gated ? 'gated: needs HF_TOKEN' : ''].filter(Boolean).join(', ')}`
      ctx.out.line(m.unverified ? `${m.model_id}${about}` : `${m.name} (${m.model_id})${about}`)
      for (const v of m.variants) {
        const mark = v.id === m.default_variant ? '*' : ' '
        ctx.out.line(
          `  ${mark} ${v.id}  ${liteRtVariantLabel(v).toLowerCase()}  ${formatSize(v.file.size)}  ${liteRtVerdictText(v.verdict)}`
        )
      }
    }
  })
  return 0
}

/** `atc models pull <model|variant> --engine litert-lm [--backend]`: the variant, checked, downloaded, followed. */
export async function pullLiteRtModel(
  ctx: CommandContext,
  model: string,
  values: Record<string, unknown>
): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const plan = (await service.execute('litert.plan', {
    model,
    ...(typeof values['backend'] === 'string' ? { backend: values['backend'] } : {}),
  })) as LiteRtModelPlan
  const print = () => {
    ctx.out.line(
      `${plan.name}: ${plan.variant_id} (${liteRtVariantLabel(plan)})${plan.unverified ? ' — Hugging Face, not verified by Atomic Chat' : ''}`
    )
    ctx.out.line(`Verdict: ${liteRtVerdictText(plan.verdict)}`)
    ctx.out.line(
      plan.present
        ? `${plan.file.path} is downloaded already, into ${plan.dir}`
        : `${plan.file.path}, ${formatSize(plan.download_bytes)}, from ${plan.repo}@${plan.revision.slice(0, 12)} into ${plan.dir}`
    )
    for (const b of plan.blockers) ctx.out.line(`  - ${b}`)
  }
  if (values['dry-run']) {
    ctx.out.result(plan, print)
    return 0
  }
  if (!ctx.flags.json) print()
  if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
  const id = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  await service.execute('litert.install', { request_id: id, plan_digest: plan.digest })
  const cancel = `atc models pull --cancel ${id} --engine litert-lm`
  if (values['detach']) {
    ctx.out.result({ id }, () =>
      ctx.out.line(`Downloading in the server as ${id}; cancel it with: ${cancel}`)
    )
    return 0
  }
  const code = await followSetup(ctx, service, {
    kind: 'litert-model',
    id,
    label: plan.variant_id,
    cancel,
    retry: `atc models pull ${plan.variant_id} --engine litert-lm --request-id ${id}`,
  })
  if (code === 0) ctx.out.line(`${plan.variant_id} is ready: atc run ${plan.variant_id} --engine litert-lm`)
  return code
}
