/**
 * One stream for the browser: the core's events and `atc`'s own, numbered by this relay so a
 * reconnecting page can resume with `Last-Event-ID`. A small ring; anything older gets a `resync`.
 */

import type { AdminEvent } from '../contract/index.js'

export type RelayListener = (event: AdminEvent) => void

export class RelayHub {
  private seq = 0
  private readonly ring: AdminEvent[] = []
  private readonly listeners = new Set<RelayListener>()

  constructor(private readonly ringSize = 1000) {}

  publish(event: AdminEvent['event'], data: unknown): AdminEvent {
    this.seq += 1
    const record: AdminEvent = { id: `r${this.seq}`, event, data }
    this.ring.push(record)
    if (this.ring.length > this.ringSize) this.ring.splice(0, this.ring.length - this.ringSize)
    for (const listener of this.listeners) listener(record)
    return record
  }

  subscribe(listener: RelayListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Events after `lastId`, or a single `resync` when the ring no longer has it. */
  replayAfter(lastId: string | undefined): AdminEvent[] {
    if (!lastId) return []
    const n = Number(lastId.replace(/^r/, ''))
    if (!Number.isFinite(n)) return [{ id: `r${this.seq}`, event: 'resync', data: { reason: 'bad-cursor' } }]
    const first = this.ring[0]
    if (n >= this.seq) return []
    if (!first || Number(first.id.slice(1)) > n + 1)
      return [{ id: `r${this.seq}`, event: 'resync', data: { reason: 'cursor-expired' } }]
    return this.ring.filter((e) => Number(e.id.slice(1)) > n)
  }

  get cursor(): string {
    return `r${this.seq}`
  }
}

export function sseFrame(event: AdminEvent): string {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data ?? null)}\n\n`
}
