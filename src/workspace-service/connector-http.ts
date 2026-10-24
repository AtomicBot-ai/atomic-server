import type { ConnectorConfig } from '../contract/index.js'
import { object } from './validation.js'
function result(value: unknown, id: number) {
  const row = object(value)
  if (row['jsonrpc'] !== '2.0' || row['id'] !== id || (!('result' in row) && !('error' in row)))
    throw new Error('Connector returned an invalid response.')
  if (row['error']) throw new Error(String(object(row['error'])['message'] ?? 'MCP request failed.'))
  return row['result']
}
export function connectorHttp(config: ConnectorConfig, request: typeof fetch) {
  let sequence = 0,
    session = '',
    protocol = '2025-03-26'
  const headers = () => ({
    ...config.headers,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': protocol,
    ...(session ? { 'Mcp-Session-Id': session } : {}),
  })
  return {
    async send(method: string, params?: unknown, notification = false): Promise<unknown> {
      const id = ++sequence
      const response = await request(config.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeout * 1000),
        headers: headers(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(!notification ? { id } : {}),
          method,
          ...(params ? { params } : {}),
        }),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(
          response.status === 401
            ? 'Connector requires authentication. Sign in or add its Authorization header.'
            : `Connector returned HTTP ${response.status}.`
        )
      }
      session = response.headers.get('mcp-session-id') ?? session
      if (notification) {
        await response.body?.cancel()
        return undefined
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Connector returned an empty response.')
      const decoder = new TextDecoder(),
        streaming = /text\/event-stream/.test(response.headers.get('content-type') ?? '')
      let body = '',
        event = ''
      const parsed = (raw: unknown) => {
        const value = result(raw, id)
        if (method === 'initialize' && typeof object(value)['protocolVersion'] === 'string')
          protocol = String(object(value)['protocolVersion'])
        return value
      }
      try {
        while (true) {
          const next = await reader.read()
          body += decoder.decode(next.value, { stream: !next.done })
          if (body.length + event.length > 4 * 1024 * 1024)
            throw new Error('Connector response exceeds 4 MB.')
          if (streaming) {
            const lines = body.split(/\r?\n/)
            body = lines.pop() ?? ''
            for (const line of lines) {
              if (line.startsWith('data:')) event += line.slice(5).trimStart() + '\n'
              else if (!line && event) {
                const row = object(JSON.parse(event))
                event = ''
                if (row['id'] === id && !row['method']) return parsed(row)
              }
            }
          } else if (next.done) return parsed(JSON.parse(body))
          if (next.done) throw new Error('Connector closed without a response.')
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    },
    async close() {
      if (!session) return
      try {
        const response = await request(config.url, {
          method: 'DELETE',
          redirect: 'error',
          headers: headers(),
          signal: AbortSignal.timeout(1000),
        })
        await response.body?.cancel()
      } catch {
        /* A server may not support session deletion; bounded cleanup must not hide the result. */
      }
    },
  }
}
