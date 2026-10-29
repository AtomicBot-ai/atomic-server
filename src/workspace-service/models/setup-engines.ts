import type { ModelSetupEngine } from '../../contract/index.js'
import type { SetupRunDeps } from './model-setup-run.js'

/** One in-flight engine install per build, shared by all setups waiting on it. */
export function setupEngineInstaller(deps: Pick<SetupRunDeps, 'link' | 'installEngine'>) {
  const engines = new Map<string, Promise<void>>()
  return (engine: ModelSetupEngine, taskId: string): Promise<void> => {
    if (deps.installEngine) return deps.installEngine(engine, taskId)
    const key = `${engine.version}/${engine.backend}`
    let pending = engines.get(key)
    if (!pending) {
      pending = deps.link
        .request('POST', '/backends/atomic-prism/install', {
          version: engine.version,
          backend: engine.backend,
          task_id: taskId,
        })
        .then(() => undefined)
        .finally(() => engines.delete(key))
      engines.set(key, pending)
    }
    return pending
  }
}
