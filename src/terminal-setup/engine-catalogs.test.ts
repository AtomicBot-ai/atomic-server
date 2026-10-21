import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { engineCatalogs } from './engine-catalogs.js'

describe('engineCatalogs', () => {
  it('reports why the check failed when every catalog request fails, not that no engine fits', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = {
      engines: [{ engine: 'llamacpp-upstream' }, { engine: 'llamacpp' }],
    }
    const request = link.request.bind(link)
    link.request = (async (method: Parameters<typeof request>[0], path: string, body?: unknown) =>
      path.endsWith('/catalog')
        ? Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:53890'))
        : request(method, path, body)) as typeof link.request
    await expect(engineCatalogs(link)).rejects.toThrow('ECONNREFUSED')
  })

  it('says no engine fits when the checks answered without a build', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = { engines: [{ engine: 'llamacpp-upstream' }] }
    link.responses['POST /backends/llamacpp-upstream/catalog'] = {
      provider: 'llamacpp-upstream',
      available: [],
    }
    await expect(engineCatalogs(link)).rejects.toThrow('No compatible engine could be found')
  })
})
