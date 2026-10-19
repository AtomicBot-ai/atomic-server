import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceOperation } from '../contract/index.js'
import { McpSession } from './mcp.js'
const operations: WorkspaceOperation[] = [
  {
    name: 'api.ping',
    title: 'Ping',
    description: 'Test',
    group: 'api',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'models.load',
    title: 'Load',
    description: 'Load',
    group: 'models',
    mutates: true,
    effect: 'load',
    inputSchema: {
      type: 'object',
      properties: { model_id: { type: 'string' } },
      required: ['model_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'keys.reveal',
    title: 'Reveal',
    description: 'Reveal',
    group: 'keys',
    mutates: false,
    effect: 'secret',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
]
const message = (method: string, params = {}) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
function fixture(allowWrites = false, allowSecrets = false) {
  const execute = vi.fn(async () => ({ ok: true }))
  const server = new McpSession({ operations, execute, version: 'test', allowWrites, allowSecrets })
  return { server, execute }
}
describe('MCP lifecycle and authority', () => {
  it('initializes without touching the server and lists only permitted tools', async () => {
    const { server, execute } = fixture()
    expect(await server.handle(message('tools/list'))).toMatchObject({ error: { code: -32002 } })
    expect(await server.handle(message('initialize', { protocolVersion: '2025-06-18' }))).toMatchObject({
      result: { capabilities: { tools: { listChanged: false } } },
    })
    const response = (await server.handle(message('tools/list'))) as { result: { tools: unknown[] } }
    expect(response.result.tools).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
    expect(
      await server.handle(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
    ).toBeUndefined()
  })
  it('does not allow guessed write or secret tool names to bypass permissions', async () => {
    const { server, execute } = fixture()
    await server.handle(message('initialize'))
    for (const name of ['models_load', 'keys_reveal'])
      expect(await server.handle(message('tools/call', { name, arguments: {} }))).toMatchObject({
        error: { code: -32602 },
      })
    expect(execute).not.toHaveBeenCalled()
  })
  it('executes typed operations when explicitly enabled', async () => {
    const { server, execute } = fixture(true, true)
    await server.handle(message('initialize'))
    expect(
      await server.handle(message('tools/call', { name: 'models_load', arguments: { model_id: 'test' } }))
    ).toMatchObject({ result: { structuredContent: { operation: 'models.load', result: { ok: true } } } })
    expect(execute).toHaveBeenCalledWith('models.load', { model_id: 'test' })
  })
  it('returns tool errors as structured text and rejects malformed protocol messages', async () => {
    const { server, execute } = fixture()
    expect(await server.handle('broken')).toMatchObject({ error: { code: -32700 } })
    await server.handle(message('initialize'))
    execute.mockRejectedValueOnce(new Error('Server offline'))
    expect(await server.handle(message('tools/call', { name: 'api_ping' }))).toMatchObject({
      result: { isError: true },
    })
  })
})
