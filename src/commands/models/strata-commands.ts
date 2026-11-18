import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AtcError } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { workspace } from '../server/control.js'
import { followSetup } from './managed-model-commands.js'

export const strataPullOptions = {
  'refresh': {
    type: 'boolean',
    description: 'FastFlowLM or Strata: review the latest catalog for a model update',
  },
  'import-dir': {
    type: 'string',
    description: 'Strata: import a complete local source directory on the server',
  },
} as const

interface Plan {
  model_id: string
  digest: string
  blockers: string[]
  import_directory?: string
}

export async function pullStrataModel(ctx: CommandContext, model: string, values: Record<string, unknown>) {
  const service = await workspace(ctx)
  const id = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  const directory =
    typeof values['import-dir'] === 'string' ? resolve(ctx.io.cwd, values['import-dir']) : undefined
  const modelId = model.replace(/^strata\//, '')
  const previous = values['request-id']
    ? ((await service.execute('strata.status')) as Array<{ id: string; plan: Plan }>).find(
        (job) => job.id === id
      )
    : undefined
  if (
    previous &&
    (previous.plan.model_id !== modelId || (directory && previous.plan.import_directory !== directory))
  )
    throw new AtcError('ATC_USAGE', 'This request ID belongs to a different Strata model plan.')
  const plan =
    previous?.plan ??
    ((await service.execute('strata.plan', {
      model: modelId,
      refresh: values['refresh'] === true,
      ...(directory ? { import_directory: directory } : {}),
    })) as Plan)
  if (values['dry-run']) {
    ctx.out.result(plan, () => ctx.out.line(JSON.stringify(plan, null, 2)))
    return 0
  }
  await service.execute('strata.install', { request_id: id, plan_digest: plan.digest })
  if (values['detach']) {
    ctx.out.result({ id }, () => ctx.out.line('Strata installation started: ' + id))
    return 0
  }
  return followSetup(ctx, service, {
    kind: 'strata-model',
    id,
    label: plan.model_id,
    cancel: `atc models pull --engine strata --cancel ${id}`,
    retry: `atc models pull ${modelId} --engine strata --request-id ${id}`,
  })
}
