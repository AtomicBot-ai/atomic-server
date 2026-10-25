/**
 * An engine's accelerators in the server: the core's listing, and the `prepare` that downloads them —
 * run here, in the background, since it is not bounded by a request's time. A second call joins it, and
 * one another client runs (`ENGINE_INSTALL_IN_PROGRESS`) is waited for by asking again until it ends.
 * Progress is the core's `<engine>:accelerators` events. Foundry Local and LiteRT-LM share the routes'
 * shape, the event and the answer; what differs is named by `AcceleratorsRoutes`.
 */

import { AtomicCoreError } from '@atomic-chat/core'
import type { CoreLink } from '../../core-link/index.js'
import type { ProxyConfig } from '../../downloads/index.js'
import { AtcError } from '../../errors/index.js'

/** One step of a prepare, as both engines' events carry it. */
export interface AcceleratorStep {
  accelerator: string
  stage: string
  fraction: number | null
  reason?: string
}

/** A prepare's summary, as both engines answer it. */
export interface AcceleratorsPrepareResult {
  accelerators: Array<{ name: string; prepared: boolean; reason?: string }>
}

/** The core's listing with what this server knows of its prepare. */
export type AcceleratorsState<Listing, Step, Result> = Listing & {
  preparing: boolean
  last_result: Result | null
  last_error: string | null
  steps: Step[]
}

export interface AcceleratorsRoutes {
  /** `/runtimes/<engine>/accelerators`; its `/prepare` starts one. */
  route: string
  /** `<engine>:accelerators`. */
  event: string
  /** The engine's name in "… is not available on this platform: the core does not offer it here." */
  label: string
  /** The listing takes `?force=1` to ask the library again. */
  force: boolean
  /** The proxy a prepare downloads through, when the route takes one. */
  proxy?: () => ProxyConfig | null
}

export class EngineAccelerators<
  Listing extends object,
  Step extends AcceleratorStep = AcceleratorStep,
  Result extends AcceleratorsPrepareResult = AcceleratorsPrepareResult,
> {
  private running: Promise<void> | undefined
  private lastResult: Result | null = null
  private lastError: string | null = null
  /** The latest step of each accelerator in the prepare running now, for clients that poll. */
  private readonly steps = new Map<string, Step>()
  private readonly retryMs: number

  constructor(
    private readonly link: CoreLink,
    private readonly routes: AcceleratorsRoutes,
    options: { retryMs?: number } = {}
  ) {
    this.retryMs = options.retryMs ?? 2000
  }

  async status(force = false): Promise<AcceleratorsState<Listing, Step, Result>> {
    const query = force && this.routes.force ? '?force=1' : ''
    const listing = await this.link
      .request<Listing>('GET', `${this.routes.route}${query}`)
      .catch((error: unknown) => {
        if (error instanceof AtomicCoreError && error.code === 'PROVIDER_NOT_FOUND')
          throw new AtcError(
            'ATC_USAGE',
            `${this.routes.label} is not available on this platform: the core does not offer it here.`,
            {
              details: error.message,
            }
          )
        throw error
      })
    return {
      ...listing,
      preparing: this.running !== undefined,
      last_result: this.lastResult,
      last_error: this.lastError,
      steps: [...this.steps.values()],
    }
  }

  /** The core's events: a step of the prepare running now. */
  event(name: string, payload: unknown): void {
    const step = payload as Partial<Step> | null
    if (name === this.routes.event && this.running && typeof step?.accelerator === 'string')
      this.steps.set(step.accelerator, step as Step)
  }

  async prepare(names?: string[]): Promise<AcceleratorsState<Listing, Step, Result>> {
    if (!this.running) {
      this.lastError = null
      this.steps.clear()
      this.running = this.run(names).finally(() => {
        this.running = undefined
      })
    }
    return this.status()
  }

  private async run(names?: string[]): Promise<void> {
    const proxy = this.routes.proxy?.()
    const body = { ...(names?.length ? { accelerators: names } : {}), ...(proxy ? { proxy } : {}) }
    for (;;) {
      try {
        this.lastResult = await this.link.request<Result>('POST', `${this.routes.route}/prepare`, body)
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
