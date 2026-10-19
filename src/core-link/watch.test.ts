import type { CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import { describe, expect, it } from 'vitest'
import type { CoreEventHandler, CoreLink } from './link.js'
import { watchDaemon } from './watch.js'
import type { DaemonWatchState } from './watch.js'

/** Just enough of a link for the watcher: health, snapshot, a controllable event stream. */
function stubLink(instanceId: string) {
  let alive = true
  let frozen = false
  let snapshots = 0
  const handlers = new Set<CoreEventHandler>()
  const snapshot = (): CoreSnapshot =>
    ({
      instance_id: instanceId,
      version: '0.5.1',
      pid: 1,
      sessions: [],
      clients: [],
    }) as unknown as CoreSnapshot
  const link = {
    endpoint: { baseUrl: 'http://127.0.0.1:0', instanceId, version: '0.5.1', pid: 1 },
    health: async () => {
      // A process stopped (SIGSTOP) or with a blocked event loop: the socket accepts, nothing answers.
      if (frozen) await new Promise(() => {})
      if (!alive) throw new Error('connection refused')
      return { ok: true as const, pid: 1, version: '0.5.1', instance_id: instanceId, protocol: 1 }
    },
    snapshot: async () => {
      snapshots += 1
      return snapshot()
    },
    events: {
      subscribe: async (
        handler: CoreEventHandler,
        options: { signal: AbortSignal; onSnapshot?: (s: CoreSnapshot) => void }
      ) => {
        handlers.add(handler)
        options.onSnapshot?.(snapshot())
        await new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve()))
        handlers.delete(handler)
      },
    },
  } as unknown as CoreLink
  return {
    link,
    kill: () => (alive = false),
    freeze: () => (frozen = true),
    emit: (message: CoreEventMessage) => handlers.forEach((h) => h(message)),
    get snapshots() {
      return snapshots
    },
  }
}

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 5))
  expect(predicate()).toBe(true)
}

const summary = (s: DaemonWatchState) => (s.kind === 'up' ? `up:${s.snapshot.instance_id}` : 'down')

describe('watchDaemon', () => {
  it('goes down → up → down when the daemon starts and then dies, and attaches to the next one', async () => {
    const first = stubLink('a')
    const second = stubLink('b')
    let current: CoreLink | undefined
    const states: string[] = []
    const controller = new AbortController()
    const done = watchDaemon({
      attach: async () => current,
      signal: controller.signal,
      onState: (s) => states.push(summary(s)),
      refreshOn: [],
      heartbeatMs: 10,
      retryMs: 10,
    })
    await until(() => states.includes('down'))
    current = first.link
    await until(() => states.includes('up:a'))
    current = undefined
    first.kill()
    await until(() => states.filter((s) => s === 'down').length === 2)
    current = second.link
    await until(() => states.includes('up:b'))
    controller.abort()
    await done
    expect(states).toEqual(['down', 'up:a', 'down', 'up:b'])
  })

  it('reports an attach error once per failure and keeps retrying', async () => {
    let calls = 0
    const states: DaemonWatchState[] = []
    const controller = new AbortController()
    const done = watchDaemon({
      attach: async () => {
        calls += 1
        if (calls === 1) throw new Error('foreign owner')
        return undefined
      },
      signal: controller.signal,
      onState: (s) => states.push(s),
      refreshOn: [],
      retryMs: 5,
    })
    await until(() => calls >= 4)
    controller.abort()
    await done
    expect(states).toHaveLength(1)
    expect(states[0]).toMatchObject({ kind: 'down', error: new Error('foreign owner') })
  })

  it('reads the snapshot again after a status event, and re-attaches on an instance change', async () => {
    const stub = stubLink('a')
    let attaches = 0
    const seen: string[] = []
    const controller = new AbortController()
    const done = watchDaemon({
      attach: async () => {
        attaches += 1
        return stub.link
      },
      signal: controller.signal,
      onState: (s) => seen.push(summary(s)),
      onEvent: (m) => seen.push(m.event),
      refreshOn: ['session:started'],
      debounceMs: 1,
      heartbeatMs: 1000,
    })
    await until(() => seen.includes('up:a'))
    stub.emit({ id: '1', event: 'session:started', data: {} })
    stub.emit({ id: '2', event: 'download:progress', data: {} })
    await until(() => stub.snapshots === 1)
    stub.emit({ id: '', event: 'resync', data: { reason: 'instance-changed' } })
    await until(() => attaches === 2)
    controller.abort()
    await done
    expect(seen.slice(0, 4)).toEqual(['up:a', 'session:started', 'download:progress', 'up:a'])
  })

  it('goes down when the daemon stops answering its health check', async () => {
    const stub = stubLink('i1')
    const controller = new AbortController()
    const states: string[] = []
    let attached = 0
    const watching = watchDaemon({
      attach: async () => (attached++ === 0 ? stub.link : undefined),
      signal: controller.signal,
      onState: (s) => states.push(summary(s)),
      refreshOn: [],
      heartbeatMs: 5,
      heartbeatTimeoutMs: 30,
      retryMs: 5,
    })
    await until(() => states.includes('up:i1'))
    stub.freeze()
    await until(() => states.at(-1) === 'down')
    controller.abort()
    await watching
  })
})
