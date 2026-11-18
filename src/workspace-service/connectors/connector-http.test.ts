import { expect, it, vi } from 'vitest'
import type { ConnectorConfig } from '../../contract/index.js'
import { connectorHttp } from './connector-http.js'

const config: ConnectorConfig = {
  id: 'test',
  name: 'Test',
  type: 'http',
  url: 'http://127.0.0.1:1/mcp',
  command: '',
  args: [],
  env: {},
  headers: {},
  timeout: 1,
  enabled: true,
}

it('reports an unreachable or silent connector server as a usage answer, not a server failure', async () => {
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }),
  })
  const request = vi.fn<typeof fetch>(async () => {
    throw refused
  })
  await expect(connectorHttp(config, request).send('initialize')).rejects.toMatchObject({
    code: 'ATC_USAGE',
  })
  const silent = vi.fn<typeof fetch>(async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  })
  await expect(connectorHttp(config, silent).send('initialize')).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: 'Connector connection timed out.',
  })
})
