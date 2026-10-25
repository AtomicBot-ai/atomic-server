import { describe, expect, it, vi } from 'vitest'
import { SnapshotCache } from './snapshot-cache.js'

function cache(maxAgeMs = 1000) {
  let now = 0,
    n = 0
  const pending: Array<() => void> = []
  const read = vi.fn(
    () =>
      new Promise<{ n: number }>((resolve) => {
        const value = { n: ++n }
        pending.push(() => resolve(value))
      })
  )
  const c = new SnapshotCache(read, { now: () => now, maxAgeMs })
  const settle = async () => {
    while (pending.length) pending.shift()!()
    await Promise.resolve()
  }
  return { c, read, settle, tick: (ms: number) => (now += ms) }
}

describe('the snapshot cache', () => {
  it('shares one read between callers that ask while it runs', async () => {
    const { c, read, settle } = cache()
    const both = Promise.all([c.get(), c.get()])
    await settle()
    expect(await both).toEqual([{ n: 1 }, { n: 1 }])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('answers from the last read while it is younger than its age limit, then reads again', async () => {
    const { c, read, settle, tick } = cache(1000)
    const first = c.get()
    await settle()
    await first
    tick(999)
    expect(await c.get()).toEqual({ n: 1 })
    tick(1)
    const later = c.get()
    await settle()
    expect(await later).toEqual({ n: 2 })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reads again after an invalidation, even inside the age limit', async () => {
    const { c, settle } = cache()
    const first = c.get()
    await settle()
    await first
    c.invalidate()
    const second = c.get()
    await settle()
    expect(await second).toEqual({ n: 2 })
  })

  it('does not hand out a read that started before an invalidation', async () => {
    const { c, read, settle } = cache()
    const stale = c.get()
    c.invalidate()
    const fresh = c.get()
    await settle()
    expect(await stale).toEqual({ n: 1 })
    expect(await fresh).toEqual({ n: 2 })
    expect(await c.get()).toEqual({ n: 2 })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps nothing from a failed read', async () => {
    let fail = true
    const read = vi.fn(async () => {
      if (fail) throw new Error('core busy')
      return { ok: true }
    })
    const c = new SnapshotCache(read, { now: () => 0, maxAgeMs: 1000 })
    await expect(c.get()).rejects.toThrow('core busy')
    fail = false
    expect(await c.get()).toEqual({ ok: true })
  })

  it('gives each caller its own copy, so one caller changing it cannot change another’s', async () => {
    const c = new SnapshotCache(async () => ({ list: [1] }), { now: () => 0, maxAgeMs: 1000 })
    const a = await c.get()
    a.list.push(2)
    expect(await c.get()).toEqual({ list: [1] })
  })
})
