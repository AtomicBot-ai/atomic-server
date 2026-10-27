/**
 * The server's own work once it is ready, from the config: `api.autoStart` brings the API up on the
 * configured listener and `models.autoLoad` runs the named models. Each failure is a warning in the
 * log; the server is up either way, and `atc api start` or `atc run` can finish the job.
 */

import type { AtcConfig } from '../config/index.js'
import type { Logger } from '../output/index.js'

export interface BootPlan {
  startApi: boolean
  models: string[]
}

export interface BootDeps {
  startApi(): Promise<unknown>
  loadModel(model: string): Promise<unknown>
  log: Pick<Logger, 'info' | 'warn'>
}

/** One row of `models.installed`, as far as the boot needs it. */
export interface InstalledRow {
  store?: string
  providers?: string[]
}

export function bootPlan(config: AtcConfig): BootPlan {
  const models = [...new Set(config.models.autoLoad.map((m) => m.trim()).filter(Boolean))]
  return { startApi: config.api.autoStart, models }
}

/** The engine a boot load goes to: like `atc run` without `--engine`, the default when it runs the model. */
export function bootProvider(row: InstalledRow, fallback: string): string {
  if (row.store === 'foundry-local' || row.store === 'litert-lm') return row.store
  const providers = row.providers ?? []
  return providers.includes(fallback) ? fallback : (providers[0] ?? fallback)
}

/** `loadModel` over the workspace: the installed row names the engine, like `atc run` without `--engine`. */
export function bootLoader(
  execute: (operation: string, input: Record<string, unknown>) => Promise<unknown>,
  defaultEngine: string
): BootDeps['loadModel'] {
  return async (model) => {
    const rows = (await execute('models.installed', {})) as Array<InstalledRow & { id: string }>
    const row = rows.find((r) => r.id === model)
    if (!row) throw new Error(`${model} is not installed`)
    await execute('models.load', { provider: bootProvider(row, defaultEngine), model_id: model })
  }
}

export async function runBoot(plan: BootPlan, deps: BootDeps): Promise<void> {
  if (plan.startApi) {
    try {
      await deps.startApi()
      deps.log.info('API started (api.autoStart)')
    } catch (e) {
      deps.log.warn(`API not started (api.autoStart): ${reason(e)}`)
    }
  }
  for (const model of plan.models) {
    try {
      await deps.loadModel(model)
      deps.log.info(`${model} loaded (models.autoLoad)`)
    } catch (e) {
      deps.log.warn(`${model} not loaded (models.autoLoad): ${reason(e)}`)
    }
  }
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
