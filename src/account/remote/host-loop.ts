/**
 * The host's long-poll loop: one round after another, at least a second apart unless something woke it,
 * backing off from 2 s to a minute on failures (longer when the service says `Retry-After`), and ending on
 * a failure that ends hosting.
 */
import type { HostSync } from './remote-api.js'
import { AccountApiError } from '../account-api.js'
import { isFatal } from './host-round.js'

const FIRST_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000
/** A service answering long-polls at once never makes this loop spin faster than this. */
const MIN_ROUND_MS = 1_000

export interface Loop {
  stop(): void
  wake(): void
  /** Settles once the loop has ended, whatever ended it; never rejects. */
  ended: Promise<void>
}

export interface LoopRound {
  /** One round: sync with `wait` seconds after `after`, act on the answer; resolves with its state version. */
  round(after: number | null, wait: number, signal: AbortSignal): Promise<HostSync>
  succeeded(sync: HostSync): void
  failed(error: unknown, retryInMs: number): void
  fatal(error: unknown): Promise<void>
  now: () => number
}

export function startLoop(work: LoopRound, waitSeconds: number, done: () => void): Loop {
  let stopped = false
  let woken = false
  let controller = new AbortController()
  let interrupt: (() => void) | null = null
  const loop: Loop = {
    ended: Promise.resolve(),
    stop: () => {
      stopped = true
      controller.abort()
      interrupt?.()
    },
    wake: () => {
      woken = true
      controller.abort()
      interrupt?.()
    },
  }
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      timer.unref?.()
      interrupt = () => {
        clearTimeout(timer)
        resolve()
      }
    }).finally(() => {
      interrupt = null
    })
  const ended = (async () => {
    let after: number | null = null
    let wait = 0
    let backoff = FIRST_BACKOFF_MS
    while (!stopped) {
      if (woken) wait = 0
      woken = false
      controller = new AbortController()
      const started = work.now()
      try {
        const sync = await work.round(after, wait, controller.signal)
        work.succeeded(sync)
        after = sync.state_version
        wait = waitSeconds
        backoff = FIRST_BACKOFF_MS
        const elapsed = work.now() - started
        if (!woken && !stopped && elapsed < MIN_ROUND_MS) await pause(MIN_ROUND_MS - elapsed)
      } catch (error) {
        if (stopped) break
        if (controller.signal.aborted && woken) continue
        if (isFatal(error)) {
          await work.fatal(error)
          break
        }
        const retryAfter = error instanceof AccountApiError ? error.retryAfterMs : 0
        const delay = Math.min(Math.max(backoff, retryAfter), 10 * MAX_BACKOFF_MS)
        work.failed(error, delay)
        wait = 0
        await pause(delay)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
    }
  })()
    .catch((error: unknown) => {
      // What fails after the loop gave up (a fatal step, the data folder gone at shutdown) is reported like any
      // other failure, never left as an unhandled rejection.
      try {
        work.failed(error, 0)
      } catch {
        // Nothing left to tell.
      }
    })
    .finally(done)
  loop.ended = ended
  return loop
}
