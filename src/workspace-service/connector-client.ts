import { connectorSse } from './connector-sse.js'
import { connectorStdio } from './connector-stdio.js'
import { connectorHttp } from './connector-http.js'
import type { ConnectorConfig, ConnectorTool } from '../contract/index.js'
import { object } from './validation.js'
interface Transport {
  send(method: string, params?: unknown, notification?: boolean): Promise<unknown>
  close(): void | Promise<void>
}
/** Explicit connection and tool invocation; no external process starts just by opening Settings. */
export async function withConnector<T>(
  config: ConnectorConfig,
  request: typeof fetch,
  env: NodeJS.ProcessEnv,
  run: (transport: Transport, tools: ConnectorTool[]) => Promise<T>
): Promise<T> {
  if (!config.enabled) throw new Error('Enable this connector before connecting.')
  const transport =
    config.type === 'stdio'
      ? connectorStdio(config, env)
      : config.type === 'sse'
        ? connectorSse(config, request)
        : connectorHttp(config, request)
  try {
    const initialized = object(
      await transport.send('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'Atomic Server', version: '0.1.0' },
      })
    )
    if (!['2024-11-05', '2025-03-26', '2025-06-18'].includes(String(initialized['protocolVersion'])))
      throw new Error('Connector uses an unsupported MCP protocol version.')
    await transport.send('notifications/initialized', undefined, true)
    const tools: ConnectorTool[] = [],
      cursors = new Set<string>()
    let cursor: string | undefined,
      pages = 0
    do {
      const page = object(await transport.send('tools/list', cursor ? { cursor } : {}))
      if (!Array.isArray(page['tools'])) throw new Error('Connector returned an invalid tool list.')
      for (const raw of page['tools']) {
        const tool = object(raw)
        if (
          typeof tool['name'] !== 'string' ||
          !tool['name'].trim() ||
          object(tool['inputSchema'])['type'] !== 'object'
        )
          throw new Error('Connector returned an invalid tool definition.')
        tools.push(raw as ConnectorTool)
      }
      cursor = typeof page['nextCursor'] === 'string' ? page['nextCursor'] : undefined
      if (cursor && cursors.has(cursor)) throw new Error('Connector repeated a tool-list page.')
      if (cursor) cursors.add(cursor)
      if (++pages > 100 || tools.length > 1000) throw new Error('Connector exposes too many tools or pages.')
    } while (cursor)
    return await run(transport, tools)
  } finally {
    await transport.close()
  }
}
