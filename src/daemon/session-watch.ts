/**
 * What the server does when a model's process ends: a line in its log either way (the core only emits
 * an event), and after a death — never after an unload — the model loaded again, at most `maxRestarts`
 * times per model within `windowMs`, so a model that cannot run does not loop forever.
 */

import type { Logger } from '../output/index.js'

export interface DiedPayload {
  provider: string
  model_id: string
  exit_code: number | null
  signal: string | null
  message: string
}

export function sessionEventLine(
  event: string,
  payload: unknown
): { level: 'warn' | 'info'; message: string } | undefined {
  const p = payload as Partial<DiedPayload>
  if (event === 'session:died') {
    const how = p.signal ? `signal ${p.signal}` : `exit code ${p.exit_code ?? 'unknown'}`
    return { level: 'warn', message: `${p.model_id} on ${p.provider} died (${how}): ${p.message}` }
  }
  if (event === 'session:unloaded')
    return { level: 'info', message: `${p.model_id} on ${p.provider} unloaded` }
  return undefined
}

export class CrashPolicy {
  private restarts = new Map<string, number[]>()
  constructor(readonly options: { maxRestarts: number; windowMs: number }) {}
  /** Count this death: `restart` while the model's window has room, else `give-up`. */
  decide(key: string, now: number): 'restart' | 'give-up' {
    const recent = (this.restarts.get(key) ?? []).filter((t) => now - t < this.options.windowMs)
    if (recent.length >= this.options.maxRestarts) {
      this.restarts.set(key, recent)
      return 'give-up'
    }
    this.restarts.set(key, [...recent, now])
    return 'restart'
  }
  /** Restarts counted for `key` in the current window. */
  count(key: string): number {
    return this.restarts.get(key)?.length ?? 0
  }
  get windowLabel(): string {
    return `${Math.round(this.options.windowMs / 60_000)} min`
  }
}

export interface SessionWatchDeps {
  reload(provider: string, model: string): Promise<unknown>
  log: Pick<Logger, 'info' | 'warn'>
  policy: CrashPolicy
  now?: () => number
}

export function watchSessions(deps: SessionWatchDeps) {
  let stopped = false
  const now = deps.now ?? Date.now
  return {
    /** Nothing from here on: the server is stopping, and its own unloads end every session. */
    stop: () => {
      stopped = true
    },
    async handle(event: string, payload: unknown): Promise<void> {
      if (stopped) return
      const line = sessionEventLine(event, payload)
      if (!line) return
      deps.log[line.level](line.message)
      if (event !== 'session:died') return
      const { provider, model_id: model } = payload as DiedPayload
      const name = `${model} on ${provider}`,
        { maxRestarts } = deps.policy.options,
        window = deps.policy.windowLabel
      if (deps.policy.decide(`${provider}/${model}`, now()) === 'give-up') {
        deps.log.warn(
          `${name}: not restarted again (${maxRestarts} restarts within ${window}); run it by hand`
        )
        return
      }
      const attempt = deps.policy.count(`${provider}/${model}`)
      deps.log.info(`${name}: restarting (${attempt} of ${maxRestarts} within ${window})`)
      try {
        await deps.reload(provider, model)
        deps.log.info(`${name} restarted`)
      } catch (e) {
        deps.log.warn(`${name}: restart failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  }
}
