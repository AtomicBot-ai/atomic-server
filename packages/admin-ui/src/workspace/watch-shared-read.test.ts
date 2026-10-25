import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSharedReads, sharedRead, watchSharedRead } from './watch-shared-read'

const flush = () => vi.advanceTimersByTimeAsync(0)
let hidden = false
beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
})
afterEach(() => vi.useRealTimers())

describe('panels watching server data', () => {
  it('read at once, then all on one clock: panels opened apart refresh together', async () => {
    const a = vi.fn(async () => 'a'),
      b = vi.fn(async () => 'b')
    const stopA = watchSharedRead(a, vi.fn(), vi.fn())
    await vi.advanceTimersByTimeAsync(1000)
    const stopB = watchSharedRead(b, vi.fn(), vi.fn())
    await flush()
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1])
    await vi.advanceTimersByTimeAsync(1500)
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([2, 2])
    expect(vi.getTimerCount()).toBe(1)
    stopA()
    stopB()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skip ticks while the page is hidden and catch up when it shows again', async () => {
    const read = vi.fn(async () => 1)
    const stop = watchSharedRead(read, vi.fn(), vi.fn())
    await flush()
    hidden = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(read).toHaveBeenCalledTimes(1)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(read).toHaveBeenCalledTimes(2)
    stop()
  })

  it('refresh at once when asked, as after a change, and never after they stop', async () => {
    const receive = vi.fn()
    const stop = watchSharedRead(async () => 'v', receive, vi.fn())
    await flush()
    refreshSharedReads()
    await flush()
    expect(receive).toHaveBeenCalledTimes(2)
    stop()
    refreshSharedReads()
    await vi.advanceTimersByTimeAsync(5000)
    expect(receive).toHaveBeenCalledTimes(2)
  })

  it('report a failed read and keep watching', async () => {
    let fail = true
    const receive = vi.fn(),
      failed = vi.fn()
    const stop = watchSharedRead(
      async () => {
        if (fail) throw new Error('offline')
        return 'back'
      },
      receive,
      failed
    )
    await flush()
    expect(failed).toHaveBeenCalledWith(new Error('offline'))
    fail = false
    await vi.advanceTimersByTimeAsync(2500)
    expect(receive).toHaveBeenCalledWith('back')
    stop()
  })
})

describe('reads shared between panels', () => {
  it('send one request for panels asking the same thing at the same time', async () => {
    let answer!: (value: unknown) => void
    const execute = vi.fn(() => new Promise((resolve) => (answer = resolve))) as never
    const both = Promise.all([sharedRead(execute, 'engines.list'), sharedRead(execute, 'engines.list')])
    answer(['llamacpp'])
    expect(await both).toEqual([['llamacpp'], ['llamacpp']])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('ask again once the answer is in, and keep different inputs apart', async () => {
    const execute = vi.fn(async (_name: string, input?: object) => input ?? null) as never
    await sharedRead(execute, 'engines.list')
    await sharedRead(execute, 'engines.list')
    await Promise.all([
      sharedRead(execute, 'settings.get', { provider: 'a' }),
      sharedRead(execute, 'settings.get', { provider: 'b' }),
    ])
    expect(execute).toHaveBeenCalledTimes(4)
  })

  it('give every waiting panel the same failure, then ask again on the next call', async () => {
    let fail = true
    const execute = vi.fn(async () => {
      if (fail) throw new Error('offline')
      return 'ok'
    }) as never
    const results = await Promise.allSettled([
      sharedRead(execute, 'cloud.list'),
      sharedRead(execute, 'cloud.list'),
    ])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    fail = false
    expect(await sharedRead(execute, 'cloud.list')).toBe('ok')
  })

  it('never hands a read that started before a change to a panel that asks after it', async () => {
    const answers: Array<(value: unknown) => void> = []
    const execute = vi.fn(() => new Promise((resolve) => answers.push(resolve))) as never
    const before = sharedRead(execute, 'config.get')
    refreshSharedReads()
    const after = sharedRead(execute, 'config.get')
    answers[0]!('old')
    answers[1]!('new')
    expect(await before).toBe('old')
    expect(await after).toBe('new')
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
