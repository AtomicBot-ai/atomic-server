import { describe, expect, it, vi } from 'vitest'
import { ClientReports } from './client-reports.js'

const body = { kind: 'react', name: 'TypeError', frames: ['    at render (/assets/index-Abc12.js:10:20)'] }
describe('browser report intake', () => {
  it('accepts only bounded technical fields, never arbitrary messages or envelopes', () => {
    const capture = vi.fn(),
      receiver = new ClientReports({ capture })
    expect(receiver.accept(body)).toBe(true)
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.objectContaining({ component: 'web-admin', operation: 'browser.react' }),
      })
    )
    expect(() => receiver.accept({ ...body, message: 'private prompt' })).toThrow()
    expect(() => receiver.accept({ ...body, frames: ['    at /Users/operator/private.txt:1:1'] })).toThrow()
    expect(() => receiver.accept({ ...body, name: 'Bearer private-token' })).toThrow()
    expect(capture).toHaveBeenCalledTimes(1)
  })
  it('limits incoming reports and admits them again in the next window', () => {
    let now = 0
    const capture = vi.fn(),
      receiver = new ClientReports({ capture }, () => now)
    for (let i = 0; i < 10; i++) expect(receiver.accept(body)).toBe(true)
    expect(receiver.accept(body)).toBe(false)
    now = 60_000
    expect(receiver.accept(body)).toBe(true)
    expect(capture).toHaveBeenCalledTimes(11)
  })
})
