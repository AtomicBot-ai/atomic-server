/**
 * Keep a live view of the daemon for as long as a screen is open: attach when one runs, follow its
 * events, notice when it goes (or is replaced by a new instance) and attach again when it is back.
 *
 * `SseEvents` retries a dropped stream forever against the endpoint it was built with, which is
 * right for a command but not for a screen that outlives the daemon: a restarted daemon has a new
 * control port and token. So the watcher checks `health()` on a timer and, when the link is dead or
 * belongs to another instance, drops the subscription and attaches afresh. It holds no lease, so
 * `atc stop` from another shell is never refused because a screen is open.
 */

import type { CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import { sleep as defaultSleep } from './events.js'
import type { CoreLink } from './link.js'

export type DaemonWatchState =
  { kind: 'down'; error?: unknown } | { kind: 'up'; link: CoreLink; snapshot: CoreSnapshot }

export interface WatchDaemonOptions {
  /** The link when a daemon runs, `undefined` when none does (`attachIfRunning`). */
  attach: () => Promise<CoreLink | undefined>
  signal: AbortSignal
  onState: (state: DaemonWatchState) => void
  onEvent?: (message: CoreEventMessage) => void
  /** Event names after which the snapshot is read again (`STATUS_EVENTS`). */
  refreshOn: readonly string[]
  heartbeatMs?: number
  /** A health check that takes longer is a dead link (a stopped process, a blocked event loop). */
  heartbeatTimeoutMs?: number
  retryMs?: number
  debounceMs?: number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export async function watchDaemon(options: WatchDaemonOptions): Promise<void> {
  const { signal } = options
  const sleep = options.sleep ?? defaultSleep
  let wasDown = false
  while (!signal.aborted) {
    let link: CoreLink | undefined
    let error: unknown
    try {
      link = await options.attach()
    } catch (e) {
      error = e
    }
    if (signal.aborted) return
    if (!link) {
      // Repeat a `down` only when it carries news (an error), not on every retry.
      if (!wasDown || error !== undefined)
        options.onState(error === undefined ? { kind: 'down' } : { kind: 'down', error })
      wasDown = true
      await sleep(options.retryMs ?? 1000, signal)
      continue
    }
    wasDown = false
    await follow(link, options, sleep)
    // A short pause so a stream that ends at once cannot spin; short enough to notice a restart.
    await sleep(Math.min(options.retryMs ?? 1000, 200), signal)
  }
}

/** Follow one link until it dies, is replaced, or the watch ends. */
async function follow(
  link: CoreLink,
  options: WatchDaemonOptions,
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
): Promise<void> {
  const inner = new AbortController()
  const stop = () => inner.abort()
  options.signal.addEventListener('abort', stop, { once: true })
  const instanceId = link.endpoint.instanceId
  const publish = (snapshot: CoreSnapshot) => {
    if (inner.signal.aborted) return
    if (snapshot.instance_id !== instanceId) return stop()
    options.onState({ kind: 'up', link, snapshot })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const refreshSoon = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      link.snapshot().then(publish, stop)
    }, options.debounceMs ?? 150)
  }
  const heartbeat = (async () => {
    while (!inner.signal.aborted) {
      await sleep(options.heartbeatMs ?? 2000, inner.signal)
      if (inner.signal.aborted) return
      try {
        const health = await withTimeout(link.health(), options.heartbeatTimeoutMs ?? 5000)
        if (health.instance_id !== instanceId) stop()
      } catch {
        stop()
      }
    }
  })()
  try {
    await link.events.subscribe(
      (message) => {
        options.onEvent?.(message)
        const reason = (message.data as { reason?: unknown } | null)?.reason
        if (message.event === 'resync' && reason === 'instance-changed') return stop()
        if (options.refreshOn.includes(message.event)) refreshSoon()
      },
      { signal: inner.signal, onSnapshot: publish }
    )
  } catch {
    // A stream that fails outright is a dead link; attach again.
  } finally {
    stop()
    if (timer) clearTimeout(timer)
    options.signal.removeEventListener('abort', stop)
    await heartbeat
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}
