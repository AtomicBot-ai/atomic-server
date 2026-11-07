import type { LiteRtAcceleratorsView } from '@contract'
import type { Execute } from '../../types'

/** These runtimes register accelerators after installing their library. Consent stays in the core. */
export async function installRuntime(
  execute: Execute,
  engine: string,
  taskId: string,
  preparing: () => void
) {
  await execute('engines.install', { engine, request: { task_id: taskId } })
  if (engine === 'litert-lm') {
    const view = await execute<LiteRtAcceleratorsView>('litert.accelerators')
    if (!view.accelerators.some((a) => !a.prepared)) return
  }
  preparing()
  await execute(engine === 'foundry-local' ? 'foundry.prepare' : 'litert.prepare', {})
}
