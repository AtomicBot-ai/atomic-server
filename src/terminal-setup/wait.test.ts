import { expect, it, vi } from 'vitest'
import { setupWait } from './wait.js'
it('lets cancellation escape a request that never resolves', async () => {
  const abort = new AbortController()
  const work = setupWait(new Promise(() => {}), abort.signal)
  abort.abort()
  await expect(work).rejects.toThrow('Cancelled')
})
it('bounds a stalled check and clears the timer after success', async () => {
  vi.useFakeTimers()
  try {
    const result = setupWait(new Promise(() => {}), new AbortController().signal)
    const checked = expect(result).rejects.toThrow('too long')
    await vi.advanceTimersByTimeAsync(45000)
    await checked
    await expect(setupWait(Promise.resolve(1), new AbortController().signal)).resolves.toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
