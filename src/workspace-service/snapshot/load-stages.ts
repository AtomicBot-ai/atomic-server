/**
 * The last stage of each load in progress, from the core's `session:load-progress` (design D14), kept in
 * the server's memory for the snapshot. A pair is dropped at `ready`, when its session starts, dies or
 * is unloaded, and when the server's own load of it fails (the core has no event for a failed load).
 */

import type { WorkspaceLoad } from '../../contract/index.js'

const ENDED = new Set(['session:started', 'session:died', 'session:unloaded'])

export class LoadStages {
  private readonly loads = new Map<string, WorkspaceLoad>()
  constructor(private readonly now: () => number = Date.now) {}

  event(name: string, payload: unknown): void {
    const p = (payload ?? {}) as Partial<WorkspaceLoad>
    if (typeof p.provider !== 'string' || typeof p.model_id !== 'string') return
    if (name === 'session:load-progress' && p.stage !== 'ready')
      this.loads.set(key(p.provider, p.model_id), {
        provider: p.provider,
        model_id: p.model_id,
        generation: String(p.generation ?? ''),
        stage: p.stage!,
        elapsed_ms: Number(p.elapsed_ms ?? 0),
        at: this.now(),
      })
    else if (name === 'session:load-progress' || ENDED.has(name)) this.drop(p.provider, p.model_id)
  }

  drop(provider: string, modelId: string): void {
    this.loads.delete(key(provider, modelId))
  }

  list(): WorkspaceLoad[] {
    return [...this.loads.values()]
  }
}

const key = (provider: string, modelId: string) => `${provider}\u0000${modelId}`
