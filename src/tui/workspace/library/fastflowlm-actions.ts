import { randomUUID } from 'node:crypto'
import type { FastFlowLmOperation, FastFlowLmProbePlan } from '@atomic-chat/core/contracts'
import type { ActionContext } from '../actions.js'
import { currentFlmOperation, type FlmPreparationView } from '../../../workspace-view/index.js'
type Context = Pick<ActionContext, 'get' | 'update' | 'controller' | 'hostStep'>
const update = (
  ctx: Context,
  part: { fastflowlm?: FlmPreparationView; busy?: boolean; error?: string; seen?: string }
) =>
  ctx.update((s) =>
    s.enginePanel?.engine === 'fastflowlm' ? { ...s, enginePanel: { ...s.enginePanel, ...part } } : s
  )
export async function readFlmPreparation(ctx: Context) {
  if (ctx.get().enginePanel?.engine !== 'fastflowlm') return
  update(ctx, { busy: true, seen: `flm:${ctx.get().workspace?.captured_at ?? 0}` })
  try {
    const run = ctx.controller.runtime
    const probe = (await run.execute('fastflowlm.probe')) as FastFlowLmProbePlan
    const operations = (await run.execute('fastflowlm.operations')) as FastFlowLmOperation[]
    const steps = (await run.execute('fastflowlm.host-steps')) as {
      operation_id: string
      instructions: string
    }[]
    const operation = currentFlmOperation(operations, probe)
    update(ctx, {
      fastflowlm: {
        probe,
        operation,
        instructions: steps
          .filter((s) => s.operation_id === operation?.operation_id)
          .map((s) => s.instructions),
      },
      error: '',
    })
  } catch (e) {
    update(ctx, { error: String(e) })
  } finally {
    update(ctx, { busy: false })
  }
}
export async function flmPreparationAction(id: string, ctx: Context) {
  const p = ctx.get().enginePanel
  if (p?.engine !== 'fastflowlm' || !id.startsWith('flm-')) return false
  if (p.busy) return true
  if (id === 'flm-refresh') {
    await readFlmPreparation(ctx)
    return true
  }
  const action = id.slice(4),
    op = p.fastflowlm?.operation
  if (!['prepare', 'consent', 'resume', 'stop'].includes(action) || (action !== 'prepare' && !op))
    return false
  update(ctx, { busy: true, error: '' })
  try {
    const result = await ctx.controller.runtime.execute(
      `fastflowlm.${action}`,
      action === 'prepare'
        ? { request_id: randomUUID() }
        : {
            id: op!.operation_id,
            ...(action === 'stop' ? {} : { expected_revision: op!.revision }),
            ...(action === 'consent' ? { approved_plan_digest: op!.plan.plan_digest } : {}),
          }
    )
    const current = result as FastFlowLmOperation
    if (current.state === 'preparing-host' && ctx.hostStep) {
      update(ctx, { busy: false })
      ctx.hostStep(current.operation_id)
      return true
    }
    await readFlmPreparation(ctx)
  } catch (e) {
    update(ctx, { error: String(e), busy: false })
  }
  return true
}
