import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollEvery } from './poll.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('pollEvery', () => {
  it('runs on every tick, and at once only when asked', async () => {
    const later = vi.fn(async () => {}),
      now = vi.fn(async () => {})
    const stops = [pollEvery(1000, later), pollEvery(1000, now, { immediately: true })]
    await vi.advanceTimersByTimeAsync(0)
    expect([later.mock.calls.length, now.mock.calls.length]).toEqual([0, 1])
    await vi.advanceTimersByTimeAsync(2000)
    expect([later.mock.calls.length, now.mock.calls.length]).toEqual([2, 3])
    stops.forEach((stop) => stop())
  })

  it('skips a tick while the last run is still going', async () => {
    let finish!: () => void
    const work = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const stop = pollEvery(1000, work)
    await vi.advanceTimersByTimeAsync(3000)
    expect(work).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(work).toHaveBeenCalledTimes(2)
    stop()
  })

  it('tells a run that finishes after the stop that it is no longer live, and runs no more', async () => {
    let finish!: () => void
    const seen: boolean[] = []
    const stop = pollEvery(1000, async (live) => {
      await new Promise<void>((resolve) => (finish = resolve))
      seen.push(live())
    })
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    finish()
    await vi.advanceTimersByTimeAsync(5000)
    expect(seen).toEqual([false])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps polling after a run that throws', async () => {
    const work = vi.fn(async () => {
      throw new Error('offline')
    })
    const stop = pollEvery(1000, work)
    await vi.advanceTimersByTimeAsync(3000)
    expect(work).toHaveBeenCalledTimes(3)
    stop()
  })
})
