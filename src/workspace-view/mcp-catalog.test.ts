import { expect, it } from 'vitest'
import { MCP_CONNECTORS } from '../contract/index.js'
import { connectorDraft, connectorJson, connectorTemplate, parseConnectorJson } from './mcp-catalog.js'
it('uses desktop HTTP, SSE and stdio templates and applies secrets only to the designated field', () => {
  const exa = connectorDraft(MCP_CONNECTORS.find((t) => t.serverKey === 'exa')!)
  expect(exa).toMatchObject({ type: 'http', url: 'https://mcp.exa.ai/mcp' })
  expect(connectorDraft(MCP_CONNECTORS.find((t) => t.serverKey === 'webflow')!).type).toBe('sse')
  const resend = MCP_CONNECTORS.find((t) => t.serverKey === 'resend')!
  expect(() => connectorDraft(resend)).toThrow('Enter Resend API key')
  expect(connectorDraft(resend, 're-test')).toMatchObject({
    type: 'stdio',
    env: { RESEND_API_KEY: 're-test' },
  })
  expect(
    connectorDraft(
      MCP_CONNECTORS.find((t) => t.serverKey === 'firecrawl')!,
      'fc-test'
    ).headers
  ).toEqual({ Authorization: 'Bearer fc-test' })
  expect(connectorTemplate({ ...exa, id: 'renamed' })).toMatchObject({ serverKey: 'exa' })
  expect(connectorTemplate({ ...exa, id: 'renamed', url: 'https://exa.ai.attacker.example' })).toBeUndefined()
})
it('round-trips desktop JSON without losing disabled state or masked credentials', () => {
  const value = {
    ...connectorDraft(MCP_CONNECTORS[0]!),
    enabled: false,
    headers: { Authorization: '••••••••' },
  }
  expect(parseConnectorJson(connectorJson([value])).mcpServers[value.id]).toMatchObject({
    active: false,
    headers: { Authorization: '••••••••' },
  })
  expect(() => parseConnectorJson('{"mcpServers":[]}')).toThrow('must be an object')
  expect(() => parseConnectorJson('{"mcpServers":{"bad":{"args":[12]}}}')).toThrow('list of strings')
  expect(() => parseConnectorJson('{"mcpServers":{"bad":{"headers":{"token":12}}}}')).toThrow('text values')
})
