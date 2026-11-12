/**
 * The relay's SSE (`GET /api/events`) as one shared `EventSource`. The hub opens it lazily on the
 * first subscription; the browser keeps the connection and resumes with `Last-Event-ID` on its own.
 */

import { ADMIN_API } from '@contract'
import { ADMIN_BASE, relative } from './admin-api'

export interface EventMeta {
  /** The relay sequence (`r42`), or null for a source that sends none. */
  id: string | null
  event: string
}

export type EventHandler<T = unknown> = (data: T, meta: EventMeta) => void

/** What we use of `EventSource`, so a test can hand in a fake. */
export type EventSourceLike = Pick<
  EventSource,
  'addEventListener' | 'removeEventListener' | 'close' | 'readyState'
>
export type EventSourceFactory = new (url: string, init?: EventSourceInit) => EventSourceLike

export interface AdminEventSource {
  /** Deliver `event` to `handler` until the returned function is called. Opens the stream on first use. */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): () => void
  /** Drop the connection (sign-out). The next `subscribe` opens a new one. */
  close(): void
  /** Whether a stream is open or connecting. */
  readonly open: boolean
}

const CLOSED = 2

function parseData(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function createEventSource(base = ADMIN_BASE, impl?: EventSourceFactory): AdminEventSource {
  const url = `${base}${relative(ADMIN_API.events)}`
  const handlers = new Map<string, Set<EventHandler>>()
  const listeners = new Map<string, (event: Event) => void>()
  let source: EventSourceLike | null = null

  const alive = () => source !== null && source.readyState !== CLOSED

  function resolveImpl(): EventSourceFactory {
    const ctor = impl ?? (globalThis as { EventSource?: EventSourceFactory }).EventSource
    if (!ctor) throw new Error('EventSource is not available in this environment.')
    return ctor
  }

  function attach(name: string) {
    if (!source || listeners.has(name)) return
    const listener = (event: Event) => {
      const message = event as MessageEvent
      const data = parseData(message.data)
      const meta: EventMeta = { id: message.lastEventId || null, event: name }
      for (const handler of handlers.get(name) ?? []) handler(data, meta)
    }
    listeners.set(name, listener)
    source.addEventListener(name, listener)
  }

  function detach(name: string) {
    const listener = listeners.get(name)
    if (listener && source) source.removeEventListener(name, listener)
    listeners.delete(name)
  }

  /** (Re)open when there is no live stream: after `close()`, or after the server refused one (401). */
  function open() {
    if (alive()) return
    listeners.clear()
    const Impl = resolveImpl()
    source = new Impl(url, { withCredentials: true })
    for (const name of handlers.keys()) attach(name)
  }

  return {
    get open() {
      return alive()
    },
    subscribe(name, handler) {
      let set = handlers.get(name)
      if (!set) {
        set = new Set()
        handlers.set(name, set)
      }
      set.add(handler as EventHandler)
      open()
      attach(name)
      return () => {
        set.delete(handler as EventHandler)
        if (set.size === 0) {
          handlers.delete(name)
          detach(name)
        }
      }
    },
    close() {
      if (source) source.close()
      source = null
      listeners.clear()
    },
  }
}
