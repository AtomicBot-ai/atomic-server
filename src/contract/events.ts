/** The SSE the admin relays: the core's events plus `atc`'s own, one id sequence for resume. */

import type { CoreEventName } from '@atomic-chat/core/contracts'

export type AtcEventName = 'atc:status' | 'atc:log' | 'atc:host-step' | 'atc:download'

export interface AdminEvent {
  /** Relay sequence, e.g. `r42`; send it back as `Last-Event-ID` to resume. */
  id: string
  event: CoreEventName | AtcEventName | 'resync'
  data: unknown
}

/**
 * The events after which the status view (the admin dashboard, the terminal UI's Overview) may read
 * differently, plus the relay's own `resync`. Both front ends refresh on exactly this list.
 */
export const STATUS_EVENTS = [
  'resync',
  'session:started',
  'session:unloaded',
  'session:died',
  'server:started',
  'server:stopped',
  'server:bind-failed',
  'atc:status',
  'atc:host-step',
] as const
