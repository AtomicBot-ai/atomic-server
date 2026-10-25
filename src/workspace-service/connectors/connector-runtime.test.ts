import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectorValue } from '../features/feature-validation.js'
import { ConnectorOAuth } from './connector-oauth.js'
import { ConnectorRuntime } from './connector-runtime.js'

const dirs: string[] = []
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
  vi.restoreAllMocks()
})
/** A connector as saving it makes one, defaults and all. */
const connector = connectorValue({ name: 'Echo', url: 'http://127.0.0.1:1/mcp' }, 'echo')
/** An MCP server over HTTP with one tool, `echo`, whose calls fail when asked. */
function runtime(callFails = false) {
  const dir = mkdtempSync(join(tmpdir(), 'atc-connectors-'))
  dirs.push(dir)
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id?: number; method: string }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (body.method === 'tools/call' && callFails)
      return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Tool blew up' } })
    const result =
      body.method === 'initialize'
        ? { protocolVersion: '2025-06-18' }
        : body.method === 'tools/list'
          ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
          : { content: [{ type: 'text', text: 'hi' }] }
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  }) as unknown as typeof fetch
  return new ConnectorRuntime(dir, request, {})
}

describe('the connector runtime', () => {
  it('checks a connector and keeps its tools as its status', async () => {
    const r = runtime()
    expect(await r.connect('connectors.check', connector, {})).toMatchObject({ state: 'connected' })
    expect(r.statuses()['echo']).toMatchObject({ state: 'connected', tools: [{ name: 'echo' }] })
  })

  it('keeps a connector connected when a tool call fails or names no tool', async () => {
    const r = runtime(true)
    await expect(r.connect('connectors.call', connector, { tool: 'echo' })).rejects.toThrow('Tool blew up')
    await expect(r.connect('connectors.call', connector, { tool: 'nope' })).rejects.toThrow('available')
    expect(r.statuses()['echo']?.state).toBe('connected')
  })

  it('forgets one status, or all of them, and gives out copies', async () => {
    const r = runtime()
    await r.connect('connectors.check', connector, {})
    r.statuses()['echo']!.state = 'error'
    expect(r.statuses()['echo']?.state).toBe('connected')
    r.forget(['echo'])
    expect(r.statuses()).toEqual({})
    await r.connect('connectors.check', connector, {})
    r.reset()
    expect(r.statuses()).toEqual({})
  })

  it('signs each revoked connector out', async () => {
    const logout = vi.spyOn(ConnectorOAuth.prototype, 'logout').mockResolvedValue({ signed_out: true })
    await runtime().revoke(['a', 'b'])
    expect(logout.mock.calls.map(([id]) => id)).toEqual(['a', 'b'])
  })
})
