/**
 * Foundry Local's accelerators in the server (spec `foundry-local-server`, design D10): the library's
 * probe of the active build, and the `prepare` that downloads them (NPU plugins, CUDA, WebGPU — about
 * 2 GB, so it is not bounded by a request's time). The prepare runs here, in the background; a second
 * call joins it, and one another client runs (`ENGINE_INSTALL_IN_PROGRESS`) is waited for by asking
 * again until it ends. Progress is the core's `foundry-local:accelerators` events.
 */

import { AtomicCoreError } from '@atomic-chat/core'
import type {
  FoundryLocalAccelerator,
  FoundryLocalAccelerators,
  FoundryLocalAcceleratorsEvent,
  FoundryLocalPrepareResult,
} from '@atomic-chat/core/contracts'
import type { FoundryAcceleratorsView } from '../contract/index.js'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'

const ROUTE = '/runtimes/foundry-local/accelerators'

/** The accelerators a prepare would take: not prepared yet, and run by a variant (an execution provider). */
export function preparable(probe: FoundryLocalAccelerators): FoundryLocalAccelerator[] {
  return probe.accelerators.filter((a) => !a.prepared && a.execution_provider !== null)
}

function unavailable(error: unknown): never {
  if (error instanceof AtomicCoreError && error.code === 'PROVIDER_NOT_FOUND')
    throw new AtcError('ATC_USAGE', 'Foundry Local is not available on this platform.', {
      details: error.message,
    })
  throw error
}

export class FoundryAccelerators {
  private running: Promise<void> | undefined
  private lastResult: FoundryLocalPrepareResult | null = null
  private lastError: string | null = null
  /** The latest step of each accelerator in the prepare running now, for clients that poll. */
  private readonly steps = new Map<string, FoundryLocalAcceleratorsEvent>()
  private readonly retryMs: number

  constructor(
    private readonly link: CoreLink,
    options: { retryMs?: number } = {}
  ) {
    this.retryMs = options.retryMs ?? 2000
  }

  async status(force: boolean): Promise<FoundryAcceleratorsView> {
    const probe = await this.link
      .request<FoundryLocalAccelerators>('GET', `${ROUTE}${force ? '?force=1' : ''}`)
      .catch(unavailable)
    return {
      ...probe,
      preparing: this.running !== undefined,
      last_result: this.lastResult,
      last_error: this.lastError,
      steps: [...this.steps.values()],
    }
  }

  /** The core's events: a `foundry-local:accelerators` step of the prepare running now. */
  event(name: string, payload: unknown): void {
    const step = payload as Partial<FoundryLocalAcceleratorsEvent> | null
    if (name === 'foundry-local:accelerators' && this.running && typeof step?.accelerator === 'string')
      this.steps.set(step.accelerator, step as FoundryLocalAcceleratorsEvent)
  }

  async prepare(names?: string[]): Promise<FoundryAcceleratorsView> {
    if (!this.running) {
      this.lastError = null
      this.steps.clear()
      this.running = this.run(names).finally(() => {
        this.running = undefined
      })
    }
    return this.status(false)
  }

  private async run(names?: string[]): Promise<void> {
    const body = names?.length ? { accelerators: names } : {}
    for (;;) {
      try {
        this.lastResult = await this.link.request<FoundryLocalPrepareResult>('POST', `${ROUTE}/prepare`, body)
        return
      } catch (error) {
        if (error instanceof AtomicCoreError && error.code === 'ENGINE_INSTALL_IN_PROGRESS') {
          await new Promise((r) => setTimeout(r, this.retryMs))
          continue
        }
        this.lastError = error instanceof Error ? error.message : String(error)
        return
      }
    }
  }
}
