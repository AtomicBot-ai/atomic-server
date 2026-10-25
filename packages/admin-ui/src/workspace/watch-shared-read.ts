import type { WorkspaceInput } from '@contract'
import type { Execute } from './types'

/**
 * Every panel watching server data runs off one clock: they refresh together every 2.5 s while the page
 * is visible, so identical reads land at the same moment and `sharedRead` sends them once.
 */
const EVERY_MS = 2500
const watchers = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

const tick = () => {
  if (!document.hidden) watchers.forEach((refresh) => refresh())
}
const visible = () => {
  if (!document.hidden) tick()
}

/**
 * Refresh every watching panel now: after a change, so they need not wait for the next tick. Reads
 * started before it are no longer shared, so no panel is handed an answer from before the change.
 */
export function refreshSharedReads() {
  generation++
  tick()
}

/** Keep server-owned data current without remounting a panel or replacing its local draft. */
export function watchSharedRead<T>(
  read: () => Promise<T>,
  receive: (value: T) => void,
  failed: (error: unknown) => void
) {
  let live = true,
    pending = false
  const refresh = async () => {
    if (pending || !live) return
    pending = true
    try {
      const value = await read()
      if (live) receive(value)
    } catch (error) {
      if (live) failed(error)
    } finally {
      pending = false
    }
  }
  void refresh()
  watchers.add(refresh)
  if (watchers.size === 1) {
    timer = setInterval(tick, EVERY_MS)
    document.addEventListener('visibilitychange', visible)
  }
  return () => {
    live = false
    watchers.delete(refresh)
    if (watchers.size === 0) {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }
}

const running = new WeakMap<Execute, Map<string, Promise<unknown>>>()
let generation = 0

/** One request for panels that read the same operation with the same input at the same time. */
export function sharedRead<T = unknown>(execute: Execute, operation: string, input?: WorkspaceInput) {
  const key = `${generation} ${operation} ${JSON.stringify(input ?? {})}`
  let reads = running.get(execute)
  if (!reads) running.set(execute, (reads = new Map()))
  const existing = reads.get(key)
  if (existing) return existing as Promise<T>
  const read = (input ? execute<T>(operation, input) : execute<T>(operation)).finally(() => reads.delete(key))
  reads.set(key, read)
  return read
}
