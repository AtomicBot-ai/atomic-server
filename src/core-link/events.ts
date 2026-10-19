/**
 * Following the core's event stream over SSE: snapshot, then `/events` from the snapshot's cursor,
 * reconnect with backoff on a dropped socket, re-snapshot on `resync` (a cursor the replay ring no
 * longer has) and on an instance change (a new core owns the folder: derived state is stale).
 */

import type { CoreClient, CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import type { CoreEventHandler, CoreEventSource } from './link.js'

export interface SseEventsOptions {
  backoffMs?: readonly number[]
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  log?: (message: string) => void
}

const DEFAULT_BACKOFF = [500, 1000, 2000, 5000] as const

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      signal.removeEventListener('abort', done)
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

export class SseEvents implements CoreEventSource {
  private readonly backoff: readonly number[]
  private readonly wait: NonNullable<SseEventsOptions['sleep']>
  private readonly log: (message: string) => void

  constructor(
    private readonly client: Pick<CoreClient, 'snapshot' | 'events'>,
    options: SseEventsOptions = {}
  ) {
    this.backoff = options.backoffMs ?? DEFAULT_BACKOFF
    this.wait = options.sleep ?? sleep
    this.log = options.log ?? (() => undefined)
  }

  private delay(attempt: number): number {
    return this.backoff[Math.min(attempt - 1, this.backoff.length - 1)] as number
  }

  async subscribe(
    handler: CoreEventHandler,
    options: { signal: AbortSignal; onSnapshot?: (s: CoreSnapshot) => void }
  ): Promise<void> {
    const { signal } = options
    let failures = 0
    // `resync` answers in a row, with no event between: a core whose ring keeps overflowing.
    let resyncs = 0
    let instanceId: string | undefined
    // The cursor survives a dropped socket: the core replays from it. Only `resync` (a cursor its ring
    // no longer has, or another instance's) and the first connect take a snapshot.
    let cursor: string | undefined
    let fresh = true
    while (!signal.aborted) {
      // The core keeps the stream open after `resync`; this stream is ended here to snapshot again.
      const stream = new AbortController()
      const stop = () => stream.abort()
      signal.addEventListener('abort', stop, { once: true })
      try {
        if (fresh) {
          const snapshot = await this.client.snapshot()
          if (instanceId !== undefined && snapshot.instance_id !== instanceId) {
            handler({ id: '', event: 'resync', data: { reason: 'instance-changed' } })
          }
          instanceId = snapshot.instance_id
          cursor = snapshot.cursor
          options.onSnapshot?.(snapshot)
          fresh = false
          failures = 0
        }
        await this.client.events(
          (message: CoreEventMessage) => {
            if (message.event === 'resync') {
              resyncs += 1
              fresh = true
              stream.abort()
              return
            }
            failures = 0
            resyncs = 0
            cursor = message.id
            handler(message)
          },
          { ...(cursor ? { cursor } : {}), signal: stream.signal }
        )
        if (signal.aborted) continue
        // A stream that ended here for a snapshot, or by itself (a core going away, a proxy's idle
        // timeout): the first time it reconnects at once, then it backs off like a failure, so a core
        // that keeps answering `resync` or closing at once is not hammered in a tight loop.
        throw new Error(fresh ? 'the core asked for a new snapshot' : 'the event stream ended')
      } catch (error) {
        if (signal.aborted) return
        // Ended here on `resync`: the first snapshots at once, the next ones back off.
        if (fresh && stream.signal.aborted) {
          if (resyncs > 1) await this.wait(this.delay(resyncs - 1), signal)
          continue
        }
        failures += 1
        const delay = this.delay(failures)
        this.log(
          `event stream failed (${String((error as Error).message ?? error)}); retrying in ${delay} ms`
        )
        await this.wait(delay, signal)
      } finally {
        signal.removeEventListener('abort', stop)
      }
    }
  }
}
