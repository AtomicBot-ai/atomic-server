import { randomUUID } from 'node:crypto'
import type {
  FastFlowLmAccelerators,
  FastFlowLmOperation,
  FastFlowLmProbePlan,
} from '@atomic-chat/core/contracts'
import { AtcError, type CommandContext } from '../../cli/index.js'
import { FastFlowLmHostSteps, probedFacts } from '../../host/index.js'
import { attachWorkspace, workspace } from '../server/control.js'
import { follow } from './follow.js'
import { flmDriverSetupLines } from '../../workspace-view/index.js'
import { followSetup } from './managed-model-commands.js'

export async function flmAccelerators(ctx: CommandContext, values: Record<string, unknown>) {
  const { service, link } = await attachWorkspace(ctx)
  if (!values['prepare'] && !values['resume'] && !values['cancel']) {
    const facts = (await service.execute('fastflowlm.accelerators')) as FastFlowLmAccelerators
    const plan = facts.ready ? null : ((await service.execute('fastflowlm.probe')) as FastFlowLmProbePlan)
    const driverSetup = plan?.driver_setup
    ctx.out.result({ ...facts, ...(driverSetup ? { driver_setup: driverSetup } : {}) }, () => {
      ctx.out.line(facts.ready ? 'FastFlowLM NPU is ready.' : (facts.reason ?? facts.blockers.join(', ')))
      for (const line of flmDriverSetupLines(driverSetup)) ctx.out.line(line)
      if (driverSetup) ctx.out.line('Run this command again after setup to check the NPU.')
    })
    return 0
  }
  let op: FastFlowLmOperation
  if (typeof values['cancel'] === 'string') {
    op = (await service.execute('fastflowlm.stop', { id: values['cancel'] })) as FastFlowLmOperation
    ctx.out.result(op, () => ctx.out.line(`${op.operation_id}: ${op.state}`))
    return 0
  }
  if (typeof values['resume'] === 'string') {
    op = (await service.execute('fastflowlm.status', { id: values['resume'] })) as FastFlowLmOperation
    if (op.state !== 'awaiting-consent' && op.state !== 'preparing-host')
      op = (await service.execute('fastflowlm.resume', {
        id: op.operation_id,
        expected_revision: op.revision,
      })) as FastFlowLmOperation
  } else {
    const plan = (await service.execute('fastflowlm.probe')) as FastFlowLmProbePlan
    if (values['dry-run'] || plan.status === 'ready') {
      ctx.out.result(plan, () => ctx.out.line(JSON.stringify(plan, null, 2)))
      return 0
    }
    if (plan.status === 'blocked')
      throw new AtcError('ATC_USAGE', plan.blockers.join('; '), {
        hint: [
          ...flmDriverSetupLines(plan.driver_setup),
          'Complete the server setup, then run this command again.',
        ].join('\n'),
      })
    op = (await service.execute('fastflowlm.prepare', {
      request_id: values['request-id'] ?? randomUUID(),
    })) as FastFlowLmOperation
  }
  if (op.state === 'awaiting-consent') {
    if (!ctx.flags.json) ctx.out.line(JSON.stringify(op.plan, null, 2))
    if (typeof values['approve'] === 'string' && values['approve'] !== op.plan.plan_digest)
      throw new AtcError(
        'ATC_USAGE',
        'The FastFlowLM preparation plan changed. Review and approve the new digest.'
      )
    if (
      !values['approve'] &&
      !(await ctx.prompt.confirm('Apply these NPU changes to the server account and service?', {
        danger: true,
      }))
    )
      return 0
    op = (await service.execute('fastflowlm.consent', {
      id: op.operation_id,
      expected_revision: op.revision,
      approved_plan_digest: op.plan.plan_digest,
    })) as FastFlowLmOperation
  }
  const runner = new FastFlowLmHostSteps({
    link,
    atcDir: ctx.paths.atcDir,
    dataFolder: ctx.paths.dataFolder,
    elevator: ctx.host.elevator,
    context: { ...(await probedFacts(ctx.host.facts, ctx.host.exec)), inDaemon: ctx.flags.json },
  })
  const done = new Set(['ready', 'failed', 'cancelled', 'reboot-required', 'relogin-required'])
  let manual = false
  const result = await follow<FastFlowLmOperation>({
    pick: () => undefined,
    signal: ctx.signal,
    detach: values['detach'] === true,
    alwaysPoll: true,
    poll: async () => {
      const current = (await service.execute('fastflowlm.status', {
        id: op.operation_id,
      })) as FastFlowLmOperation
      if (current.state === 'preparing-host' && values['detach'] !== true) await runner.handle(current)
      manual = (await runner.pending()).some((s) => s.operation_id === op.operation_id)
      return current
    },
    finished: (v) => done.has(v.state) || manual,
    show: (v) => {
      if (!ctx.flags.json) ctx.log.info(`${v.operation_id}: ${v.state}${v.reason ? ' — ' + v.reason : ''}`)
    },
  })
  const pending = (await runner.pending()).filter((s) => s.operation_id === op.operation_id)
  ctx.out.result({ ...result.value, host_steps: pending }, () => {
    ctx.out.line(`${result.value.operation_id}: ${result.value.state}`)
    for (const step of pending) ctx.out.line(step.instructions)
    if (result.value.reason) ctx.out.line(result.value.reason)
  })
  return result.value.state === 'failed' ? 1 : 0
}
export async function flmListing(ctx: CommandContext, operation: string, query: string) {
  const result = (await (await workspace(ctx)).execute(operation, { engine: 'fastflowlm', query })) as {
    models: {
      model_id: string
      name: string
      license: string
      summary: string
      variants: {
        id: string
        summary?: string
        size_bytes: number
        verdict: { verdict: string; reason: string | null }
      }[]
    }[]
  }
  ctx.out.result(result, () => {
    for (const m of result.models)
      for (const v of m.variants)
        ctx.out.line(
          `${m.name} · ${v.id} · ${v.size_bytes} bytes · ${v.summary ?? m.summary} · ${v.verdict.reason ?? v.verdict.verdict}`
        )
  })
  return 0
}
export async function pullFlmModel(ctx: CommandContext, model: string, values: Record<string, unknown>) {
  const service = await workspace(ctx)
  const id = typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID()
  type Plan = { digest: string; model_id: string; variant_id: string; blockers: string[] }
  const previous = (await service.snapshot()).setups.find((v) => {
    const job = v as { id?: string; kind?: string }
    return job.id === id && job.kind === 'fastflowlm-model'
  }) as { plan: Plan } | undefined
  if (previous && ![previous.plan.model_id, previous.plan.variant_id].includes(model))
    throw new AtcError('ATC_USAGE', 'This request ID belongs to a different FastFlowLM model.')
  const plan =
    previous?.plan ??
    ((await service.execute('fastflowlm.plan', { model, refresh: values['refresh'] === true })) as Plan)
  if (values['dry-run']) {
    ctx.out.result(plan, () => ctx.out.line(JSON.stringify(plan, null, 2)))
    return 0
  }
  if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join('; '))
  await service.execute('fastflowlm.install', { request_id: id, plan_digest: plan.digest })
  if (values['detach']) {
    ctx.out.result({ id }, () => ctx.out.line('Download started: ' + id))
    return 0
  }
  return followSetup(ctx, service, {
    kind: 'fastflowlm-model',
    id,
    label: plan.variant_id,
    cancel: `atc models pull --engine fastflowlm --cancel ${id}`,
    retry: `atc models pull ${model} --engine fastflowlm --request-id ${id}`,
  })
}
