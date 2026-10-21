import { describe, expect, it, vi } from 'vitest'
import { patientCoreClient, patientFetch } from './patient-fetch.js'

describe('patientFetch', () => {
  it('asks the runtime for no time limit of its own, keeping the request as it was', async () => {
    const request = vi.fn(async () => new Response('ok'))
    const signal = AbortSignal.timeout(1000)
    await patientFetch(request as unknown as typeof fetch)('http://127.0.0.1/x', {
      method: 'POST',
      body: '{}',
      signal,
    })
    expect(request).toHaveBeenCalledWith('http://127.0.0.1/x', {
      method: 'POST',
      body: '{}',
      signal,
      timeout: false,
    })
  })
})

describe('patientCoreClient', () => {
  it('calls the core with no time limit of the runtime', async () => {
    const real = globalThis.fetch
    const seen: RequestInit[] = []
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response('{}')
    }) as typeof fetch
    try {
      await patientCoreClient({ baseUrl: 'http://127.0.0.1:1', token: 't', name: 'atc-daemon' }).request(
        'POST',
        '/runtimes/foundry-local/accelerators/prepare',
        {}
      )
    } finally {
      globalThis.fetch = real
    }
    expect(seen[0]).toMatchObject({ method: 'POST', timeout: false })
  })
})
