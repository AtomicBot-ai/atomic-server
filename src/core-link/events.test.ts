import { describe, expect, it } from 'vitest'
import type { CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import { SseEvents } from './events.js'

const snapshot = (instance: string, cursor: string) =>
  ({ instance_id: instance, cursor }) as unknown as CoreSnapshot

describe('SseEvents', () => {
  it('snapshots, streams from the cursor, re-snapshots on resync and stops on abort', async () => {
    const seen: string[] = []
    const cursors: Array<string | undefined> = []
    const controller = new AbortController()
    let streams = 0
    const client = {
      snapshot: async () => snapshot('i1', `i1:${streams}`),
      events: async (
        onEvent: (m: CoreEventMessage) => void,
        options: { cursor?: string; signal?: AbortSignal }
      ) => {
        cursors.push(options.cursor)
        streams += 1
        if (streams === 1) {
          onEvent({ id: 'i1:5', event: 'session:started', data: {} })
          // As the core does: `resync`, then the stream stays open for live events (lifecycle.ts).
          onEvent({ id: '', event: 'resync', data: {} })
          if (!options.signal?.aborted)
            await new Promise<void>((resolve) => options.signal?.addEventListener('abort', () => resolve()))
          return
        }
        onEvent({ id: 'i1:7', event: 'session:died', data: {} })
        controller.abort()
      },
    }
    await new SseEvents(client, { sleep: async () => {} }).subscribe((m) => seen.push(`${m.event}@${m.id}`), {
      signal: controller.signal,
    })
    expect(seen).toEqual(['session:started@i1:5', 'session:died@i1:7'])
    expect(cursors).toEqual(['i1:0', 'i1:1'])
  })

  it('retries with backoff after a failure and reports an instance change', async () => {
    const seen: string[] = []
    const waits: number[] = []
    const controller = new AbortController()
    let calls = 0
    let ended = 0
    const client = {
      snapshot: async () => {
        calls += 1
        if (calls === 1) throw new Error('down')
        return snapshot(calls === 2 ? 'i1' : 'i2', 'c')
      },
      events: async (onEvent: (m: CoreEventMessage) => void, options: { signal?: AbortSignal }) => {
        ended += 1
        if (ended === 1) return // the old core goes away: its stream ends
        if (calls === 2) {
          // The new core does not know the old cursor: `resync`, and its stream stays open.
          onEvent({ id: '', event: 'resync', data: { reason: 'cursor-expired' } })
          if (!options.signal?.aborted)
            await new Promise<void>((resolve) => options.signal?.addEventListener('abort', () => resolve()))
          return
        }
        onEvent({ id: 'i2:1', event: 'core:log', data: {} })
        controller.abort()
      },
    }
    await new SseEvents(client, {
      backoffMs: [7],
      sleep: async (ms) => {
        waits.push(ms)
      },
    }).subscribe((m) => seen.push(m.event), { signal: controller.signal })
    expect(waits).toEqual([7, 7])
    expect(seen).toEqual(['resync', 'core:log'])
  })

  it('says when the stream failed, once per failed attempt', async () => {
    const controller = new AbortController()
    const drops: string[] = []
    let streams = 0
    const client = {
      snapshot: async () => snapshot('i1', 'c'),
      events: async () => {
        streams += 1
        if (streams < 3) throw new Error(`socket ${streams}`)
        controller.abort()
      },
    }
    await new SseEvents(client, { sleep: async () => {} }).subscribe(() => {}, {
      signal: controller.signal,
      onDrop: (error) => drops.push((error as Error).message),
    })
    expect(drops).toEqual(['socket 1', 'socket 2'])
  })

  // A dropped socket loses nothing: the core replays from the cursor (its ring keeps 1000 events), so
  // the stream continues from the last event seen, without a new snapshot.
  it('continues from the last event after a dropped stream, without a new snapshot', async () => {
    const seen: string[] = []
    const cursors: Array<string | undefined> = []
    const controller = new AbortController()
    let snapshots = 0
    let streams = 0
    const client = {
      snapshot: async () => {
        snapshots += 1
        return snapshot('i1', 'i1:0')
      },
      events: async (onEvent: (m: CoreEventMessage) => void, options: { cursor?: string }) => {
        cursors.push(options.cursor)
        streams += 1
        if (streams === 1) {
          onEvent({ id: 'i1:3', event: 'download:progress', data: {} })
          throw new Error('socket hang up')
        }
        onEvent({ id: 'i1:4', event: 'download:progress', data: {} })
        controller.abort()
      },
    }
    await new SseEvents(client, { sleep: async () => {} }).subscribe((m) => seen.push(m.id), {
      signal: controller.signal,
    })
    expect(cursors).toEqual(['i1:0', 'i1:3'])
    expect(snapshots).toBe(1)
    expect(seen).toEqual(['i1:3', 'i1:4'])
  })

  it('backs off when the core keeps answering resync', async () => {
    const waits: number[] = []
    const controller = new AbortController()
    let snapshots = 0
    const client = {
      snapshot: async () => {
        if (++snapshots === 4) controller.abort()
        return snapshot('i1', 'i1:0')
      },
      events: async (onEvent: (m: CoreEventMessage) => void) => {
        onEvent({ id: '', event: 'resync', data: { reason: 'cursor-expired' } })
      },
    }
    await new SseEvents(client, {
      backoffMs: [3],
      sleep: async (ms) => {
        waits.push(ms)
      },
    }).subscribe(() => undefined, { signal: controller.signal })
    expect(waits.length).toBeGreaterThan(0)
  })
})
