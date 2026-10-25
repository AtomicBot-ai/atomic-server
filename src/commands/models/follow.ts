/**
 * Following a long job from a command's own process while the work runs in the server: the core's
 * events filtered to this job, a poll of its workspace operation whenever the event stream is down,
 * and nothing else. Ctrl-C (the command's signal) and `--detach` only stop the following; the job
 * goes on in the server, so a command never cancels anything on its way out.
 */

import type { CoreEventMessage } from '@atomic-chat/core/client'
import type { CommandContext } from '../../cli/index.js'
import type { CoreEventSource } from '../../core-link/index.js'
import { sleep as abortableSleep } from '../../core-link/index.js'
import type { ProgressHandle } from '../../output/index.js'

export const FOLLOW_POLL_MS = 2000

export interface FollowOptions<T> {
  /** The core's events; without them the job is polled (a download `atc` runs has no core event). */
  events?: CoreEventSource
  /** The value an event carries for this job, `undefined` for every other event. */
  pick(message: CoreEventMessage): T | undefined
  /** The job's current state from the server (a workspace operation). */
  poll(): Promise<T>
  finished(value: T): boolean
  show(value: T): void
  /** Orders values: an older one (a poll racing an event) is not shown. */
  revision?(value: T): number
  signal: AbortSignal
  /** Show the current state once and return. */
  detach?: boolean
  /** Poll even while events stream: for a job whose end only the server's state tells. */
  alwaysPoll?: boolean
  pollMs?: number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export type FollowResult<T> = { kind: 'finished'; value: T } | { kind: 'detached'; value: T }

export async function follow<T>(options: FollowOptions<T>): Promise<FollowResult<T>> {
  const wait = options.sleep ?? abortableSleep
  const pollMs = options.pollMs ?? FOLLOW_POLL_MS
  const stop = new AbortController()
  const onAbort = () => stop.abort()
  options.signal.addEventListener('abort', onAbort, { once: true })
  let latest: T | undefined
  let shownKey: string | undefined
  let done = false
  // Until the stream says it is up, the job is polled: a core that cannot be reached never hangs this.
  let streaming = false
  const offer = (value: T) => {
    if (done) return
    const order = options.revision?.(value)
    if (order !== undefined && latest !== undefined && order < (options.revision?.(latest) ?? order)) return
    latest = value
    const key = JSON.stringify(value)
    if (key !== shownKey) {
      shownKey = key
      options.show(value)
    }
    if (options.finished(value)) {
      done = true
      stop.abort()
    }
  }
  let connected: () => void = () => {}
  const ready = new Promise<void>((resolve) => (connected = resolve))
  const subscription = options.events
    ? options.events
        .subscribe(
          (message) => {
            streaming = true
            const value = options.pick(message)
            if (value !== undefined) offer(value)
          },
          {
            signal: stop.signal,
            onSnapshot: () => {
              streaming = true
              connected()
            },
            onDrop: () => {
              streaming = false
            },
          }
        )
        .catch(() => {})
        .finally(() => {
          streaming = false
          connected()
        })
    : Promise.resolve(connected())
  try {
    // Subscribed before the first poll, so nothing that changes between the two is missed.
    await Promise.race([ready, wait(pollMs, stop.signal)])
    if (!stop.signal.aborted) offer(await options.poll())
    while (!done && !stop.signal.aborted && !options.detach) {
      await wait(pollMs, stop.signal)
      if (!done && !stop.signal.aborted && (!streaming || options.alwaysPoll)) offer(await options.poll())
    }
  } finally {
    options.signal.removeEventListener('abort', onAbort)
    stop.abort()
    await subscription
  }
  if (latest === undefined) latest = await options.poll()
  return done ? { kind: 'finished', value: latest } : { kind: 'detached', value: latest }
}

/** How a job's state reads on a terminal: a stage name, its line, and bytes when it has them. */
export interface FollowView {
  stage: string
  text: string
  done?: number | null
  total?: number | null
}

/**
 * What `follow` shows: with `--json`, every change as one NDJSON line on stdout; otherwise a line on
 * stderr per stage, and a progress bar for a stage that counts bytes.
 */
export function followDisplay<T>(
  ctx: Pick<CommandContext, 'io' | 'progress'> & { flags: { json: boolean; quiet: boolean } },
  view: (value: T) => FollowView,
  /** What one NDJSON line holds for a value; the value itself by default. */
  line: (value: T) => unknown = (value) => value
): { show(value: T): void; close(ok: boolean, message?: string): void } {
  let stage: string | undefined
  let bar: ProgressHandle | undefined
  const endBar = (ok: boolean, message?: string) => {
    if (ok) bar?.finish(message)
    else bar?.fail(message)
    bar = undefined
  }
  return {
    show(value) {
      if (ctx.flags.json) {
        ctx.io.stdout(`${JSON.stringify(line(value))}\n`)
        return
      }
      if (ctx.flags.quiet) return
      const v = view(value)
      const counted = typeof v.done === 'number' && typeof v.total === 'number' && v.total > 0
      if (v.stage !== stage) {
        endBar(true)
        stage = v.stage
        if (counted) bar = ctx.progress.start(v.text, v.total ?? undefined)
        else ctx.io.stderr(`${v.text}\n`)
      } else if (counted && !bar) bar = ctx.progress.start(v.text, v.total ?? undefined)
      if (counted) bar?.update(v.done as number, v.total as number)
    },
    close: endBar,
  }
}
