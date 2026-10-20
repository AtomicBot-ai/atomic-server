import { describe, expect, it } from 'vitest'
import type { CoreEventMessage } from '@atomic-chat/core/client'
import type { CoreEventHandler, CoreEventSource } from '../core-link/index.js'
import { recordingIo } from '../io.js'
import { colorsFor, createProgress } from '../output/index.js'
import { follow, followDisplay } from './follow.js'

interface Op {
  operation_id: string
  revision: number
  phase: string
  progress?: { completed: number; total: number } | null
}
const op = (revision: number, phase: string, extra: Partial<Op> = {}): Op => ({
  operation_id: 'op-1',
  revision,
  phase,
  ...extra,
})
const event = (data: unknown, name = 'environment:operation'): CoreEventMessage =>
  ({ id: `i:${Math.random()}`, event: name, data }) as CoreEventMessage

/** An event source a test drives: emit, drop the stream, or fail to subscribe at all. */
function source(options: { fails?: boolean } = {}) {
  let handler: CoreEventHandler | undefined
  let drop: ((error: unknown) => void) | undefined
  const events: CoreEventSource & { emit(m: CoreEventMessage): void; drop(): void; subscribed: boolean } = {
    subscribed: false,
    subscribe: async (h, o) => {
      if (options.fails) throw new Error('no stream')
      handler = h
      drop = o.onDrop
      events.subscribed = true
      o.onSnapshot?.({} as never)
      await new Promise<void>((resolve) =>
        o.signal.addEventListener('abort', () => resolve(), { once: true })
      )
      events.subscribed = false
    },
    emit: (m) => handler?.(m),
    drop: () => drop?.(new Error('dropped')),
  }
  return events
}

/** A wait that only an abort ends, as the real one ends early on abort. */
const never = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true }))
const tick = () => new Promise((r) => setTimeout(r, 0))
const pick = (m: CoreEventMessage) =>
  m.event === 'environment:operation' && (m.data as Op).operation_id === 'op-1' ? (m.data as Op) : undefined
const finished = (o: Op) => ['ready', 'failed', 'cancelled'].includes(o.phase)

describe('follow', () => {
  it('shows the current state, then only the events its filter picks, until a final one', async () => {
    const events = source()
    const shown: string[] = []
    const result = follow({
      events,
      pick,
      poll: async () => op(1, 'checking'),
      finished,
      revision: (o) => o.revision,
      show: (o) => shown.push(o.phase),
      signal: new AbortController().signal,
      sleep: never,
    })
    await tick()
    events.emit(event({ ...op(2, 'pulling-image'), operation_id: 'op-2' }))
    events.emit(event(op(2, 'pulling-image'), 'environment:changed'))
    events.emit(event(op(2, 'pulling-image')))
    events.emit(event(op(2, 'pulling-image')))
    events.emit(event(op(3, 'ready')))
    expect(await result).toEqual({ kind: 'finished', value: op(3, 'ready') })
    expect(shown).toEqual(['checking', 'pulling-image', 'ready'])
    expect(events.subscribed).toBe(false)
  })

  it('returns at once when the operation has already finished', async () => {
    const result = await follow({
      events: source(),
      pick,
      poll: async () => op(9, 'ready'),
      finished,
      show: () => {},
      signal: new AbortController().signal,
    })
    expect(result.kind).toBe('finished')
  })

  it('polls while the stream is down and stops polling when events come back', async () => {
    const events = source()
    let polls = 0
    let sleeps = 0
    const states = [op(1, 'checking'), op(2, 'pulling-image'), op(3, 'pulling-image')]
    const result = follow({
      events,
      pick,
      poll: async () => states[Math.min(polls++, states.length - 1)] as Op,
      finished,
      revision: (o) => o.revision,
      show: () => {},
      signal: new AbortController().signal,
      pollMs: 2000,
      sleep: async (ms: number) => {
        expect(ms).toBe(2000)
        sleeps += 1
        await tick()
      },
    })
    await tick()
    expect(polls).toBe(1)
    events.drop()
    await new Promise((r) => setTimeout(r, 20))
    expect(polls).toBeGreaterThan(1)
    events.emit(event(op(4, 'verifying')))
    const after = polls
    await new Promise((r) => setTimeout(r, 20))
    expect(polls).toBe(after)
    expect(sleeps).toBeGreaterThan(0)
    events.emit(event(op(5, 'ready')))
    expect((await result).kind).toBe('finished')
  })

  it('falls back to polling when it cannot subscribe at all', async () => {
    let polls = 0
    const result = await follow({
      events: source({ fails: true }),
      pick,
      poll: async () => (++polls < 3 ? op(polls, 'pulling-image') : op(polls, 'ready')),
      finished,
      show: () => {},
      signal: new AbortController().signal,
      sleep: async () => {},
    })
    expect(result).toEqual({ kind: 'finished', value: op(3, 'ready') })
  })

  it('polls from the start when there is no event stream (a download atc runs itself)', async () => {
    let polls = 0
    const result = await follow({
      pick: () => undefined,
      poll: async () => (++polls < 3 ? op(polls, 'pulling-image') : op(polls, 'ready')),
      finished,
      show: () => {},
      signal: new AbortController().signal,
      sleep: async () => {},
    })
    expect(result).toEqual({ kind: 'finished', value: op(3, 'ready') })
  })

  it('detaches on the signal or on `detach`, calling nothing but the poll', async () => {
    const events = source()
    const controller = new AbortController()
    let polls = 0
    const running = follow({
      events,
      pick,
      poll: async () => (polls++, op(1, 'pulling-image')),
      finished,
      show: () => {},
      signal: controller.signal,
      sleep: never,
    })
    await tick()
    controller.abort()
    expect(await running).toEqual({ kind: 'detached', value: op(1, 'pulling-image') })
    expect(polls).toBe(1)
    expect(events.subscribed).toBe(false)

    const detached = await follow({
      events: source(),
      pick,
      poll: async () => op(1, 'pulling-image'),
      finished,
      show: () => {},
      signal: new AbortController().signal,
      detach: true,
    })
    expect(detached.kind).toBe('detached')
  })
})

describe('followDisplay', () => {
  const view = (o: Op) => ({
    stage: o.phase,
    text: `phase ${o.phase}`,
    done: o.progress?.completed ?? null,
    total: o.progress?.total ?? null,
  })
  const display = (json: boolean) => {
    const io = recordingIo()
    const colors = colorsFor(false)
    const progress = createProgress(io, {
      isTTY: false,
      quiet: false,
      json,
      verbose: false,
      colors,
      width: 80,
    })
    return { io, display: followDisplay<Op>({ io, flags: { json, quiet: false }, progress }, view) }
  }

  it('writes each change as one NDJSON line with --json', () => {
    const { io, display: d } = display(true)
    d.show(op(1, 'checking'))
    d.show(op(2, 'pulling-image', { progress: { completed: 10, total: 100 } }))
    d.close(true)
    expect(io.out.map((l) => JSON.parse(l).phase)).toEqual(['checking', 'pulling-image'])
    expect(io.out.every((l) => l.endsWith('\n') && !l.slice(0, -1).includes('\n'))).toBe(true)
    expect(io.err).toEqual([])
  })

  it('prints a line per stage and a byte progress for a stage that has one', () => {
    const { io, display: d } = display(false)
    d.show(op(1, 'checking'))
    d.show(op(2, 'pulling-image', { progress: { completed: 0, total: 100 } }))
    d.show(op(3, 'pulling-image', { progress: { completed: 100, total: 100 } }))
    d.show(op(4, 'ready'))
    d.close(true)
    const text = io.err.join('')
    expect(text).toContain('phase checking\n')
    expect(text).toContain('phase pulling-image')
    expect(text).toContain('100%')
    expect(text).toContain('phase ready\n')
    expect(io.out).toEqual([])
  })
})
