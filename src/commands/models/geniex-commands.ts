import { randomUUID } from 'node:crypto'
import { AtcError, type CommandContext } from '../../cli/index.js'
import { workspace } from '../server/control.js'
import { followSetup } from './managed-model-commands.js'

export async function genieListing(ctx: CommandContext, op: string, query: string) {
  const result = (await (await workspace(ctx)).execute(op, { engine: 'geniex', query })) as {
    list_error: string | null
    huggingface_error: string | null
    models: {
      model_id: string
      name: string
      unverified: boolean
      variants: { id: string; verdict: { verdict: string } }[]
    }[]
  }
  ctx.out.result(result, () => {
    if (result.list_error) ctx.out.note(result.list_error)
    if (result.huggingface_error) ctx.out.note(result.huggingface_error)
    ctx.out.table(
      [{ header: 'MODEL' }, { header: 'VARIANTS' }, { header: 'SOURCE' }],
      result.models.map((m) => [
        m.model_id,
        m.variants.map((v) => v.id + ' (' + v.verdict.verdict + ')').join(', '),
        m.unverified ? 'Hugging Face (unverified)' : 'Curated',
      ])
    )
  })
  return 0
}

export async function pullGenieModel(ctx: CommandContext, model: string, values: Record<string, unknown>) {
  const service = await workspace(ctx)
  const rid = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  type Plan = {
    digest: string
    model_id: string
    variant: { id: string; backend: string }
    variant_id: string
    blockers: string[]
    download_bytes: number
  }
  const previous =
    typeof values['request-id'] === 'string'
      ? ((await service.snapshot()).setups as { id?: string; kind?: string; plan?: Plan }[]).find(
          (s) => s.id === rid && s.kind === 'geniex-model'
        )
      : undefined
  const plan = (
    previous && 'plan' in previous
      ? previous.plan
      : await service.execute('geniex.plan', {
          model,
          ...(typeof values.backend === 'string' ? { variant: values.backend } : {}),
        })
  ) as Plan
  if (
    previous &&
    (![plan.model_id, plan.variant.id, plan.variant_id].includes(model) ||
      (typeof values.backend === 'string' &&
        ![plan.variant.id, plan.variant.backend].includes(values.backend)))
  )
    throw new AtcError('ATC_USAGE', 'This request ID belongs to another model or variant.')
  if (values['dry-run']) {
    ctx.out.result(plan, () =>
      ctx.out.line([plan.variant_id, plan.download_bytes + ' bytes', ...plan.blockers].join(' · '))
    )
    return 0
  }
  if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
  await service.execute('geniex.install', { request_id: rid, plan_digest: plan.digest })
  if (values.detach) {
    ctx.out.result({ id: rid }, () => ctx.out.line('Download started: ' + rid))
    return 0
  }
  return followSetup(ctx, service, {
    kind: 'geniex-model',
    id: rid,
    label: plan.variant_id,
    cancel: `atc models pull --engine geniex --cancel ${rid}`,
    retry: `atc models pull ${model} --engine geniex --request-id ${rid}`,
  })
}
