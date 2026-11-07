import type { ActionContext } from '../actions.js'
import { record } from '../library/library-model.js'

/** MLX onboarding downloads a whole checkpoint through the existing durable artifact queue. */
export async function installMlxFirstModel(model: string, ctx: ActionContext): Promise<boolean> {
  ctx.update((s) => ({ ...s, busy: true, setup: s.setup ? { ...s.setup, busy: true, error: '' } : null }))
  try {
    const plan = record(
      await ctx.controller.runtime.execute('artifacts.plan', { category: 'text', model_id: model })
    )
    if (Array.isArray(plan['blockers']) && plan['blockers'].length)
      throw new Error(plan['blockers'].map(String).join(' '))
    await ctx.controller.runtime.execute('artifacts.install', {
      plan_digest: plan['digest'],
      request_id: `terminal-mlx-${String(plan['digest'])}`,
    })
    const selected = String(plan['model_id'] ?? model)
    await ctx.controller.save('tui.model', selected)
    const workspace = await ctx.controller.runtime.snapshot()
    ctx.update((s) => ({
      ...s,
      workspace,
      model: selected,
      setup: null,
      firstRun: 'permissions',
      page: 'welcome',
      focus: 'first-permission:notifications',
    }))
  } catch (error) {
    ctx.update((s) => ({
      ...s,
      setup: s.setup
        ? {
            ...s.setup,
            error: error instanceof Error ? error.message : String(error),
          }
        : null,
    }))
  } finally {
    ctx.update((s) => ({ ...s, busy: false, setup: s.setup ? { ...s.setup, busy: false } : null }))
  }
  return true
}
