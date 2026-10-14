import { AtcError, defineCommand } from '../cli/index.js'
import { McpSession } from '../agent-control/index.js'
import { WORKSPACE_OPERATIONS } from '../workspace-service/index.js'
import { ATC_VERSION } from '../version.js'
import { workspace } from './control.js'
export const mcpCommand = defineCommand({
  name: 'mcp',
  summary: 'Serve agent tools over MCP stdio',
  group: 'server',
  description:
    'Read-only by default. --allow-writes enables server changes; --allow-secrets additionally permits credential export. The client launches this command as a subprocess. Only JSON-RPC is written to stdout.',
  options: {
    'allow-writes': {
      type: 'boolean',
      description: 'Allow installation, generation and configuration tools',
    },
    'allow-secrets': {
      type: 'boolean',
      description: 'Allow explicitly requested API credentials and agent profiles',
    },
  },
  run: async (inv, ctx) => {
    if (!ctx.io.inputLines) throw new AtcError('ATC_USAGE', 'MCP requires a standard input stream.')
    let service: ReturnType<typeof workspace> | undefined
    const session = new McpSession({
      operations: WORKSPACE_OPERATIONS,
      version: ATC_VERSION,
      allowWrites: inv.values['allow-writes'] === true,
      allowSecrets: inv.values['allow-secrets'] === true,
      execute: (name, input) => (service ??= workspace(ctx)).then((s) => s.execute(name, input)),
    })
    const pending = new Set<Promise<void>>()
    for await (const line of ctx.io.inputLines()) {
      if (!line.trim()) continue
      if (line.length > 8 * 1024 * 1024) {
        ctx.io.stderr('MCP message exceeds 8 MiB.\n')
        return 2
      }
      const task = session.handle(line).then((reply) => {
        if (reply !== undefined) ctx.io.stdout(JSON.stringify(reply) + '\n')
      })
      pending.add(task)
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task)
      )
      if (pending.size >= 32) await Promise.race(pending)
    }
    await Promise.all(pending)
    return 0
  },
})
