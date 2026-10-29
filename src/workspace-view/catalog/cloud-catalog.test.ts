import { expect, it } from 'vitest'
import { CLOUD_CATALOG, cloudNeedsKey } from './cloud-catalog.js'

/** Local OpenAI-compatible servers in the catalog. A key is not required for these three. */
const LOCAL_SERVERS = new Set(['llamacpp-server', 'automatic1111', 'sdcpp-server'])

it('requires a key for a catalog provider that is not one of the three local servers', () => {
  for (const id of LOCAL_SERVERS) expect(CLOUD_CATALOG.some((provider) => provider.id === id)).toBe(true)
  for (const provider of CLOUD_CATALOG) {
    expect(cloudNeedsKey(provider.id)).toBe(!LOCAL_SERVERS.has(provider.id))
  }
  expect(cloudNeedsKey('')).toBe(false)
  expect(cloudNeedsKey('local-gateway')).toBe(false)
})
