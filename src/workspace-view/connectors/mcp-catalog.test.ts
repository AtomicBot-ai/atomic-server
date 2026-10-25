import { expect, it } from 'vitest'
import {
  MCP_CONNECTORS,
  connectorDraft,
  connectorJson,
  connectorTemplate,
  parseConnectorJson,
} from './mcp-catalog.js'
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

// The catalog is JSON: TypeScript no longer checks it, so this does.
it.each(MCP_CONNECTORS.map((t) => [t.serverKey, t] as const))(
  '%s is a complete connector card',
  (_key, t) => {
    expect(t.serverKey).toMatch(/^[a-z0-9-]+$/)
    expect(t.name && t.author && t.description && t.tagline).toBeTruthy()
    const draft = connectorDraft(t, t.secret ? 'key' : '')
    expect(['http', 'sse', 'stdio']).toContain(draft.type)
    expect(draft.type === 'stdio' ? draft.command : draft.url).toBeTruthy()
    expect(t.icon.bg).toMatch(/^#[0-9a-f]{6}$/i)
  }
)
