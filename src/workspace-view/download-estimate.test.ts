import { describe, expect, it } from 'vitest'
import { downloadEta, downloadSpeed, formatEta, nextTransferSample } from './download-estimate.js'

describe('download estimates both clients show', () => {
  it('measures speed between two samples of the same download, and starts over for another', () => {
    const first = nextTransferSample(undefined, 'a', 100, 1000)
    expect(first).toEqual({ id: 'a', bytes: 100, at: 1000, speed: 0 })
    const second = nextTransferSample(first, 'a', 600, 3000)
    expect(second.speed).toBe(250)
    expect(nextTransferSample(second, 'a', 600, 4000).speed).toBe(0)
    expect(nextTransferSample(second, 'b', 900, 4000).speed).toBe(0)
  })

  it('keeps the last sample until a second has passed, so two quick renders make no spike', () => {
    const sample = { id: 'a', bytes: 600, at: 3000, speed: 250 }
    expect(nextTransferSample(sample, 'a', 1600, 3020)).toBe(sample)
  })

  it.each([
    ['the server’s own estimate', { progress: { eta_seconds: 12 }, total: 100, transferred: 0 }, 50, 12],
    ['the server’s estimate in milliseconds', { eta_ms: 4500, total: 100, transferred: 0 }, 50, 4.5],
    ['what is left at the measured speed', { total: 1000, transferred: 400 }, 200, 3],
    ['nothing without a speed', { total: 1000, transferred: 400 }, 0, undefined],
    ['nothing without a size', { transferred: 400 }, 200, undefined],
  ])('estimates from %s', (_name, row, speed, eta) => {
    expect(downloadEta(row, speed)).toBe(eta)
  })

  it('prefers a speed the server reports over the sampled one', () => {
    expect(downloadSpeed({ progress: { bytes_per_second: 10 } }, 99)).toBe(10)
    expect(downloadSpeed({ bytes_per_second: 7 }, 99)).toBe(7)
    expect(downloadSpeed({}, 99)).toBe(99)
  })

  it.each([
    [0.2, '1 sec'],
    [59, '59 sec'],
    [60, '1 min'],
    [61, '2 min'],
  ])('says %s seconds as %s', (seconds, text) => {
    expect(formatEta(seconds)).toBe(text)
  })
})
