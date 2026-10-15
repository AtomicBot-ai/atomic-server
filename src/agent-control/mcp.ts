import type { WorkspaceOperation } from '../contract/index.js'

interface McpOptions {
  operations: readonly WorkspaceOperation[]
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>
  version: string
  allowWrites: boolean
  allowSecrets: boolean
}
type RpcId = string | number | null
const failure = (id: RpcId, code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})
const success = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result })
/** A stdio MCP session. Credentials never enter initialization or discovery responses. */
export class McpSession {
  private initialized = false
  constructor(private readonly options: McpOptions) {}
  private allowed(op: WorkspaceOperation): boolean {
    return (!op.mutates || this.options.allowWrites) && (op.effect !== 'secret' || this.options.allowSecrets)
  }
  async handle(line: string): Promise<unknown | undefined> {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      return failure(null, -32700, 'Invalid JSON.')
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return failure(null, -32600, 'Invalid request.')
    const m = raw as Record<string, unknown>
    const hasId = Object.hasOwn(m, 'id')
    const id = typeof m['id'] === 'string' || typeof m['id'] === 'number' ? m['id'] : null
    if (m['jsonrpc'] !== '2.0' || typeof m['method'] !== 'string')
      return failure(id, -32600, 'Invalid request.')
    if (!hasId) return undefined
    const params =
      m['params'] && typeof m['params'] === 'object' && !Array.isArray(m['params'])
        ? (m['params'] as Record<string, unknown>)
        : {}
    if (m['method'] === 'initialize') {
      this.initialized = true
      const requested = params['protocolVersion']
      return success(id, {
        protocolVersion: requested === '2025-03-26' ? requested : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'atomic-server', version: this.options.version },
        instructions:
          'Inspect operations first. Plan downloads before installing. Long jobs return operation IDs; inspect or resume them. Secrets require explicit server permission.',
      })
    }
    if (m['method'] === 'ping') return success(id, {})
    if (!this.initialized) return failure(id, -32002, 'Initialize this session first.')
    if (m['method'] === 'tools/list')
      return success(id, {
        tools: this.options.operations
          .filter((op) => this.allowed(op))
          .map((op) => ({
            name: op.name.replaceAll('.', '_'),
            title: op.title,
            description: op.description,
            inputSchema: op.inputSchema,
            annotations: {
              readOnlyHint: !op.mutates,
              destructiveHint: op.effect === 'interrupt' || /\.(remove|revoke)$/.test(op.name),
              openWorldHint: true,
            },
          })),
      })
    if (m['method'] !== 'tools/call') return failure(id, -32601, 'Unknown method.')
    const op = this.options.operations.find((op) => op.name.replaceAll('.', '_') === params['name'])
    if (!op) return failure(id, -32602, 'Unknown tool.')
    if (!this.allowed(op)) return failure(id, -32602, 'This operation is not enabled for this MCP session.')
    const input = params['arguments'] ?? {}
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return failure(id, -32602, 'Tool arguments must be an object.')
    try {
      const result = await this.options.execute(op.name, input as Record<string, unknown>)
      const structuredContent = { operation: op.name, result: result ?? null }
      return success(id, {
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent,
      })
    } catch (error) {
      const e = error as { code?: string; message?: string }
      return success(id, {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: { code: e.code ?? 'OPERATION_FAILED', message: e.message ?? 'Operation failed.' },
            }),
          },
        ],
      })
    }
  }
}
