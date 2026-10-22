import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { hubAuthorized } from './hub-fetch.js'

const hub = new FixtureHttpServer()
const cdn = new FixtureHttpServer()
let hubBase = ''
let cdnBase = ''
beforeAll(async () => {
  hubBase = await hub.start()
  cdnBase = await cdn.start()
})
afterAll(async () => {
  await hub.stop()
  await cdn.stop()
})

describe('hubAuthorized', () => {
  it('sends the token to the Hub, and not to the CDN it redirects to', async () => {
    cdn.files.set('/blob', { body: Buffer.from('weights') })
    hub.files.set('/repo/resolve/sha/m.litertlm', { body: Buffer.alloc(0), redirect: `${cdnBase}/blob` })
    const request = hubAuthorized(fetch, hubBase, 'hf_secret')
    const response = await request(`${hubBase}/repo/resolve/sha/m.litertlm`, {
      headers: { Range: 'bytes=0-' },
    })
    expect(await response.text()).toBe('weights')
    expect(hub.requests.at(-1)?.authorization).toBe('Bearer hf_secret')
    expect(cdn.requests.at(-1)?.authorization).toBeUndefined()
    expect(cdn.requests.at(-1)?.range).toBe('bytes=0-')
  })

  it('keeps a Request’s own headers', async () => {
    hub.files.set('/repo/resolve/sha/r.litertlm', { body: Buffer.from('abcdef') })
    const request = hubAuthorized(fetch, hubBase, 'hf_secret')
    const response = await request(
      new Request(`${hubBase}/repo/resolve/sha/r.litertlm`, { headers: { Range: 'bytes=2-' } })
    )
    expect(await response.text()).toBe('cdef')
    expect(hub.requests.at(-1)).toMatchObject({ range: 'bytes=2-', authorization: 'Bearer hf_secret' })
  })

  it('is the plain fetch without a token', () => {
    expect(hubAuthorized(fetch, hubBase, undefined)).toBe(fetch)
  })
})
