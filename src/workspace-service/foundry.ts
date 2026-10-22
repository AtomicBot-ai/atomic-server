/**
 * Foundry Local's accelerators in the server (spec `foundry-local-server`, design D10): the library's
 * probe of the active build, and the `prepare` that downloads them (NPU plugins, CUDA, WebGPU — about
 * 2 GB, so it is not bounded by a request's time). The prepare runs here, in the background; a second
 * call joins it, and one another client runs (`ENGINE_INSTALL_IN_PROGRESS`) is waited for by asking
 * again until it ends. Progress is the core's `foundry-local:accelerators` events.
 */

import type {
  FoundryLocalAccelerator,
  FoundryLocalAccelerators,
  FoundryLocalAcceleratorsEvent,
  FoundryLocalPrepareResult,
} from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { EngineAccelerators } from './accelerators.js'

/** The accelerators a prepare would take: not prepared yet, and run by a variant (an execution provider). */
export function preparable(probe: FoundryLocalAccelerators): FoundryLocalAccelerator[] {
  return probe.accelerators.filter((a) => !a.prepared && a.execution_provider !== null)
}

export class FoundryAccelerators extends EngineAccelerators<
  FoundryLocalAccelerators,
  FoundryLocalAcceleratorsEvent,
  FoundryLocalPrepareResult
> {
  constructor(link: CoreLink, options: { retryMs?: number } = {}) {
    super(
      link,
      {
        route: '/runtimes/foundry-local/accelerators',
        event: 'foundry-local:accelerators',
        label: 'Foundry Local',
        force: true,
      },
      options
    )
  }
}
