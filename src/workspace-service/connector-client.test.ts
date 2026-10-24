import { expect, it, vi } from 'vitest'
import type { ConnectorConfig } from '../contract/index.js'
import { withConnector } from './connector-client.js'
import { connectorSse } from './connector-sse.js'
const config: ConnectorConfig = {
  id: 'test',
  name: 'Test',
  type: 'http',
  url: 'http://127.0.0.1:1234/mcp',
  command: '',
  args: [],
  env: {},
  headers: {},
  timeout: 1,
  enabled: true,
}
function rpc(page: unknown, version = '2025-06-18') {
  return vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    const request = JSON.parse(String(init?.body))
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 })
    return Response.json(
      {
        jsonrpc: '2.0',
        id: request.id,
        result: request.method === 'initialize' ? { protocolVersion: version } : page,
      },
      { headers: { 'mcp-session-id': 'one-session' } }
    )
  })
}
it('uses the negotiated protocol and closes its HTTP session after successful checks', async () => {
  const request = rpc({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] })
  expect(await withConnector(config, request, {}, async (_client, tools) => tools[0]?.name)).toBe('echo')
  const init = request.mock.calls.at(-1)?.[1]
  expect(init?.method).toBe('DELETE')
  expect(new Headers(init?.headers).get('MCP-Protocol-Version')).toBe('2025-06-18')
  expect(new Headers(init?.headers).get('Mcp-Session-Id')).toBe('one-session')
})
it('rejects looping pagination and closes even on failure', async () => {
  const request = rpc({ tools: [], nextCursor: 'again' })
  await expect(withConnector(config, request, {}, async () => {})).rejects.toThrow('repeated')
  expect(request).toHaveBeenCalledTimes(5)
  expect(request.mock.calls.at(-1)?.[1]?.method).toBe('DELETE')
})
it.each([{ tools: [null] }, { tools: [{ name: 'bad', inputSchema: {} }] }, {}])(
  'rejects malformed tool lists %j',
  async (page) => {
    await expect(withConnector(config, rpc(page), {}, async () => {})).rejects.toThrow('invalid tool')
  }
)
it('never accepts a mismatched JSON-RPC response as the requested result', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ jsonrpc: '2.0', id: 999, result: {} }))
  await expect(withConnector(config, request, {}, async () => {})).rejects.toThrow('invalid response')
})
it('runs an explicit stdio handshake without exposing stderr or inherited secrets', async () => {
  const script = `process.stdin.on('data', c => { for (const line of String(c).trim().split('\\n')) {
    const q=JSON.parse(line); if(!q.id) continue;
    const result=q.method==='initialize'?{protocolVersion:'2025-03-26'}:{tools:[]};
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');
  }});`
  await expect(
    withConnector(
      { ...config, type: 'stdio', command: process.execPath, args: ['-e', script] },
      fetch,
      { PATH: '/usr/bin' },
      async (_client, tools) => tools
    )
  ).resolves.toEqual([])
  await expect(
    withConnector(
      {
        ...config,
        type: 'stdio',
        command: process.execPath,
        args: ['-e', 'process.stderr.write("secret-key");process.exit(7)'],
      },
      fetch,
      {},
      async () => {}
    )
  ).rejects.toThrow('Connector exited (7).')
})
it('fails a quiet stdio connector at its configured request deadline', async () => {
  await expect(
    withConnector(
      {
        ...config,
        type: 'stdio',
        timeout: 0.05,
        command: process.execPath,
        args: ['-e', 'process.stdin.resume()'],
      },
      fetch,
      {},
      async () => {}
    )
  ).rejects.toThrow('timed out')
})
it('keeps the SSE stream alive after discovery and gives each later request its own deadline', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'POST') {
      const q = JSON.parse(String(init.body))
      setTimeout(
        () =>
          stream.enqueue(
            encoder.encode(`data: ${JSON.stringify({ jsonrpc: '2.0', id: q.id, result: { ok: true } })}\n\n`)
          ),
        10
      )
      return new Response(null, { status: 202 })
    }
    return new Response(
      new ReadableStream({
        start(controller) {
          stream = controller
          controller.enqueue(encoder.encode('event: endpoint\ndata: /messages\n\n'))
          init?.signal?.addEventListener('abort', () => controller.error(new Error('closed')))
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  })
  const client = connectorSse({ ...config, timeout: 0.05 }, request)
  try {
    await expect(client.send('first')).resolves.toEqual({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 70))
    await expect(client.send('second')).resolves.toEqual({ ok: true })
  } finally {
    client.close()
  }
})
it('rejects SSE message endpoints on another origin before sending credentials', async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response('event: endpoint\ndata: https://elsewhere.test/messages\n\n')
  )
  const client = connectorSse(config, request)
  try {
    await expect(client.send('initialize')).rejects.toThrow('different origin')
  } finally {
    client.close()
  }
  expect(request).toHaveBeenCalledTimes(1)
})
