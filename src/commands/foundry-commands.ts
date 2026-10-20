/**
 * Foundry Local from `atc engines` (spec `foundry-local-server`, "Ускорители Foundry Local"): what the
 * library finds, and preparing the accelerators a variant runs on — in the server, followed here by the
 * core's `foundry-local:accelerators` events. An accelerator without an execution provider is never
 * offered; a host with nothing but the CPU needs nothing prepared.
 */

import type { CoreEventMessage } from '@atomic-chat/core/client'
import type { FoundryLocalAcceleratorsEvent } from '@atomic-chat/core/contracts'
import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { randomUUID } from 'node:crypto'
import type { FoundryAcceleratorsView, FoundryModelPlan } from '../contract/index.js'
import { variantLabel } from '../workspace-service/index.js'
import type { FoundrySearchResult } from '../workspace-service/index.js'
import { formatSize } from '../workspace-view/index.js'
import { attachWorkspace } from './control.js'
import { follow, followDisplay } from './follow.js'
import { followSetup } from './managed-model-commands.js'

type Step =
  { kind: 'step'; step: FoundryLocalAcceleratorsEvent } | { kind: 'status'; view: FoundryAcceleratorsView }

const preparable = (view: FoundryAcceleratorsView) =>
  view.accelerators.filter((a) => !a.prepared && a.execution_provider !== null)

/** Prepare `names` (else every preparable accelerator) in the server and follow it to its end. */
export async function prepareAccelerators(ctx: CommandContext, names: string[] = []): Promise<number> {
  const { link, service } = await attachWorkspace(ctx)
  const view = (await service.execute('foundry.accelerators')) as FoundryAcceleratorsView
  const offered = preparable(view).map((a) => a.name)
  const refused = names.filter(
    (n) => !view.accelerators.some((a) => a.name === n && a.execution_provider !== null)
  )
  if (refused.length)
    throw new AtcError('ATC_USAGE', `No Foundry Local variant runs on ${refused.join(', ')}.`, {
      hint: offered.length ? `prepare one of: ${offered.join(', ')}` : 'nothing here needs preparing',
    })
  const wanted = names.length ? names : offered
  if (wanted.length === 0 && !view.preparing) {
    ctx.out.line(
      view.accelerators.some((a) => a.execution_provider !== null && a.execution_provider !== 'cpu')
        ? 'Every accelerator is prepared.'
        : 'Only the CPU is here: Foundry Local models run on the CPU, and nothing needs preparing.'
    )
    return 0
  }
  await service.execute('foundry.prepare', wanted.length ? { accelerators: wanted } : {})
  const display = followDisplay<Step>({ io: ctx.io, progress: ctx.progress, flags: ctx.flags }, (s) =>
    s.kind === 'step'
      ? {
          stage: `${s.step.accelerator}:${s.step.stage}`,
          text: `${s.step.accelerator}: ${s.step.stage}${s.step.reason ? ` (${s.step.reason})` : ''}`,
          done: s.step.fraction === null ? null : Math.round(s.step.fraction * 100),
          total: s.step.fraction === null ? null : 100,
        }
      : { stage: 'status', text: s.view.preparing ? 'Preparing accelerators' : 'Prepared' }
  )
  const result = await follow<Step>({
    events: link.events,
    pick: (m: CoreEventMessage) =>
      m.event === 'foundry-local:accelerators'
        ? { kind: 'step', step: m.data as FoundryLocalAcceleratorsEvent }
        : undefined,
    poll: async () => ({
      kind: 'status',
      view: (await service.execute('foundry.accelerators')) as FoundryAcceleratorsView,
    }),
    // The events say a step ended; only the server's state says the whole prepare did.
    finished: (s) => s.kind === 'status' && !s.view.preparing,
    show: (s) => display.show(s),
    signal: ctx.signal,
    pollMs: 1000,
    alwaysPoll: true,
  })
  display.close(true)
  const last = result.value.kind === 'status' ? result.value.view : undefined
  if (last?.last_error) throw new AtcError('ATC_USAGE', `Preparing accelerators failed: ${last.last_error}`)
  ctx.out.result(last?.last_result ?? {}, () => {
    for (const a of last?.last_result?.accelerators ?? [])
      ctx.out.line(
        `${a.name}: ${a.prepared ? 'prepared' : `not prepared${a.reason ? ` — ${a.reason}` : ''}`}`
      )
  })
  return 0
}

export const acceleratorsCommand = defineCommand({
  name: 'accelerators',
  summary: "Foundry Local's accelerators: list, refresh, prepare",
  positionals: [
    { name: 'engine', description: 'foundry-local', required: true },
    {
      name: 'accelerator',
      description: 'With --prepare: the ones to prepare (default every one not prepared)',
      rest: true,
    },
  ],
  options: {
    refresh: { type: 'boolean', description: 'Ask the library again' },
    prepare: { type: 'boolean', description: 'Download and register accelerators' },
  },
  examples: ['atc engines accelerators foundry-local', 'atc engines accelerators foundry-local --prepare'],
  run: async (inv, ctx) => {
    if (inv.positionals[0] !== 'foundry-local')
      throw new AtcError('ATC_USAGE', 'Only Foundry Local has accelerators to prepare.')
    if (inv.values['prepare']) return prepareAccelerators(ctx, inv.positionals.slice(1))
    const { service } = await attachWorkspace(ctx)
    const view = (await service.execute('foundry.accelerators', {
      force: inv.values['refresh'] === true,
    })) as FoundryAcceleratorsView
    ctx.out.result(view, () => {
      if (view.error) ctx.out.note(view.error)
      ctx.out.table(
        [
          { header: 'ACCELERATOR' },
          { header: 'PROVIDER' },
          { header: 'DEVICE' },
          { header: 'PREPARED' },
          { header: 'WHY NOT' },
        ],
        view.accelerators.map((a) => [
          a.name,
          a.execution_provider ?? '-',
          a.device,
          a.prepared ? 'yes' : 'no',
          a.reason ?? '',
        ])
      )
      if (view.preparing) ctx.out.note('a prepare is running in the server')
    })
    return 0
  },
})

const LABELS: Record<string, string> = {
  cpu: 'CPU',
  cuda: 'CUDA',
  webgpu: 'WebGPU',
  openvino: 'OpenVINO',
  qnn: 'QNN',
  vitisai: 'Vitis AI',
}

/** `atc models search [query] --engine foundry-local`: models, their variants here, the core's verdicts. */
export async function foundryListing(ctx: CommandContext, query: string): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const result = (await service.execute('models.search', {
    engine: 'foundry-local',
    query,
  })) as FoundrySearchResult
  ctx.out.result(result, () => {
    if (result.list_source !== 'remote' && result.list_error)
      ctx.out.note(
        `conf's Foundry Local list could not be read (${result.list_error}); using the ${result.list_source === 'cache' ? 'last copy' : 'bundled list'}`
      )
    if (result.catalog_unavailable)
      ctx.out.note(`Microsoft's catalog could not be read: ${result.catalog_error ?? ''}`)
    if (!result.models.length)
      ctx.out.line(`No Foundry Local model for ${result.platform}${query ? ` matches "${query}"` : ''}.`)
    for (const m of result.models) {
      ctx.out.line(
        `${m.name} (${m.model_id})${m.unverified ? ' — Microsoft catalog, not verified by Atomic Chat' : ''}`
      )
      for (const v of m.variants) {
        const device =
          v.device === 'npu' || (v.execution_provider === 'openvino' && v.device === 'gpu')
            ? ` ${v.device.toUpperCase()}`
            : ''
        const verdict =
          v.verdict.verdict === 'ok'
            ? 'ok'
            : `${v.verdict.verdict}${v.verdict.reason ? ` — ${v.verdict.reason}` : ''}${
                v.verdict.verdict === 'accelerator-not-prepared'
                  ? ' (atc engines accelerators foundry-local --prepare)'
                  : v.verdict.verdict === 'engine-not-installed'
                    ? ' (atc engines install foundry-local)'
                    : ''
              }`
        const mark = v.id === m.default_variant ? '*' : ' '
        ctx.out.line(
          `  ${mark} ${v.id}  ${LABELS[v.execution_provider] ?? v.execution_provider}${device}  ${v.size_bytes ? formatSize(v.size_bytes) : '?'}  ${verdict}`
        )
      }
    }
  })
  return 0
}

/** `atc models pull <model|variant> --engine foundry-local [--device]`: the variant, checked, downloaded, followed. */
export async function pullFoundryModel(
  ctx: CommandContext,
  model: string,
  values: Record<string, unknown>
): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const plan = (await service.execute('foundry.plan', {
    model,
    ...(typeof values['device'] === 'string' ? { device: values['device'] } : {}),
  })) as FoundryModelPlan
  const print = () => {
    ctx.out.line(
      `${plan.name}: ${plan.variant_id} (${variantLabel(plan)})${plan.unverified ? ' — Microsoft catalog, not verified by Atomic Chat' : ''}`
    )
    ctx.out.line(`Verdict: ${plan.verdict.verdict}${plan.verdict.reason ? ` — ${plan.verdict.reason}` : ''}`)
    ctx.out.line(
      `${plan.pending.length} of ${plan.files.length} files to download, ${formatSize(plan.download_bytes)}, into ${plan.dir}`
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
  await service.execute('foundry.install', { request_id: id, plan_digest: plan.digest })
  if (values['detach']) {
    ctx.out.result({ id }, () =>
      ctx.out.line(
        `Downloading in the server as ${id}; cancel it with: atc models pull --cancel ${id} --engine foundry-local`
      )
    )
    return 0
  }
  const code = await followSetup(ctx, service, {
    kind: 'foundry-model',
    id,
    label: plan.variant_id,
    cancel: `atc models pull --cancel ${id} --engine foundry-local`,
    retry: `atc models pull ${model} --engine foundry-local --request-id ${id}`,
  })
  if (code === 0)
    ctx.out.line(`${plan.variant_id} is ready: atc run ${plan.variant_id} --engine foundry-local`)
  return code
}
