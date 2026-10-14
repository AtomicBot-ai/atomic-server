import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
let t: TestRun
afterEach(() => t?.cleanup())
const output = () => JSON.parse(t.io.out.join('')) as Record<string, unknown>
describe('agent and scripted workspace commands', () => {
  it('discovers schemas offline without starting Core', async () => {
    t = testRun({ running: false })
    expect(await t.run(['control', 'list', '--json'])).toBe(0)
    expect(output()).toMatchObject({
      schema_version: 1,
      operations: expect.arrayContaining([
        expect.objectContaining({ name: 'models.plan', inputSchema: expect.any(Object) }),
        expect.objectContaining({ name: 'media.image.create' }),
      ]),
    })
    expect(t.link.calls).toEqual([])
  })
  it('routes friendly load and structured operations to the same Core', async () => {
    t = testRun()
    const request = t.link.request
    t.link.request = async <T>(method: Parameters<typeof request>[0], path: string, body?: unknown) => {
      if (method === 'GET' && path === '/backends/llamacpp-upstream')
        return { backends: [{ version: 'test' }] } as T
      return request<T>(method, path, body)
    }
    expect(await t.run(['run', 'owner/model', '--engine', 'llamacpp-upstream', '--json'])).toBe(0)
    expect(t.link.calls).toContainEqual(
      expect.objectContaining({ path: '/models/llamacpp-upstream/owner/model/load' })
    )
    t.io.out.length = 0
    expect(
      await t.run([
        'control',
        'call',
        'settings.get',
        '--input',
        '{"provider":"llamacpp-upstream"}',
        '--json',
      ])
    ).toBe(0)
    expect(output()).toMatchObject({ schema_version: 1, operation: 'settings.get', status: 'ok' })
    expect(t.link.calls).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/settings/llamacpp-upstream' })
    )
  })
  it('rejects malformed and unknown inputs before a Core mutation', async () => {
    t = testRun()
    for (const args of [
      ['control', 'call', 'api.start', '--input', '[]'],
      ['control', 'call', 'unknown'],
      ['control', 'call', 'models.load', '--input', '{"model_id":"x"}'],
      ['control', 'call', 'api.start', '--input', '{"injected":true}'],
    ])
      expect(await t.run([...args, '--json'])).toBe(2)
    expect(t.link.calls).toEqual([])
  })
  it('records manual setup and never presents an interactive prompt', async () => {
    t = testRun()
    expect(await t.run(['setup', 'manual', '--json'])).toBe(0)
    expect(output()).toMatchObject({ operation: 'setup.manual', status: 'ok' })
    t.io.out.length = 0
    expect(await t.run(['control', 'watch', '--count', '1'])).toBe(0)
    const body = output() as { snapshot: { setup: { mode: string } } }
    expect(body.snapshot.setup.mode).toBe('manual')
  })
  it('does not disclose API keys through list but supports an explicit reveal', async () => {
    t = testRun()
    expect(await t.run(['api', 'key', 'create', 'Agent test', '--json'])).toBe(0)
    const created = output() as { result: { token: string; id: string } }
    expect(created.result.token).toBeTruthy()
    const secret = created.result.token
    t.io.out.length = 0
    expect(await t.run(['api', 'key', 'list', '--json'])).toBe(0)
    expect(t.io.out.join('')).not.toContain(secret)
    t.io.out.length = 0
    expect(await t.run(['api', 'key', 'show', '--id', created.result.id, '--reveal', '--json'])).toBe(0)
    expect(t.io.out.join('')).toContain(secret)
  })
  it('serves MCP discovery as pure JSON-RPC and keeps writes disabled by default', async () => {
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'api_start' } },
    ]
    t = testRun({
      running: false,
      io: {
        inputLines: async function* () {
          for (const line of lines) yield JSON.stringify(line)
        },
      },
    })
    expect(await t.run(['mcp'])).toBe(0)
    const replies = t.io.out
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(replies.find((r) => r.id === 1)).toMatchObject({
      result: { serverInfo: { name: 'atomic-server' } },
    })
    expect(
      replies.find((r) => r.id === 2).result.tools.some((tool: { name: string }) => tool.name === 'api_start')
    ).toBe(false)
    expect(replies.find((r) => r.id === 3)).toMatchObject({ error: { code: -32602 } })
    expect(t.link.calls).toEqual([])
  })
})
