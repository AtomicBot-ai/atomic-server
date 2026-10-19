import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { parseControlInput } from '../agent-control/index.js'
import { createWorkspaceClient, WORKSPACE_OPERATIONS } from '../workspace-service/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'

export async function workspace(ctx: CommandContext, launch = true): Promise<WorkspaceClient> {
  const [link, config] = await Promise.all([ctx.core.attach({ launch }), ctx.config()])
  return createWorkspaceClient({
    link,
    paths: ctx.paths,
    config: config.values,
    fetch: ctx.io.fetch,
    selfCommand: ctx.host.selfCommand,
  })
}
export async function inputFile(ctx: CommandContext, value: unknown): Promise<Record<string, unknown>> {
  if (typeof value !== 'string') return {}
  const text = value.startsWith('@') ? await ctx.io.readFile(value.slice(1)) : value
  if (text === undefined) throw new AtcError('ATC_USAGE', `Cannot read input file: ${value.slice(1)}`)
  return parseControlInput(text)
}
export async function operation(
  ctx: CommandContext,
  name: string,
  input: Record<string, unknown> = {}
): Promise<number> {
  const result = await (await workspace(ctx)).execute(name, input)
  const envelope = { schema_version: 1, operation: name, status: 'ok', result: result ?? null }
  ctx.out.result(envelope, () =>
    ctx.out.line(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
  )
  return 0
}
export const controlCommand = defineCommand({
  name: 'control',
  summary: 'Typed server operations for scripts and agents',
  group: 'server',
  description:
    'All operations use the same validation and implementation as the terminal and web admin. Discovery works offline. Calls start the local server if needed. --json never opens a screen or prompts for missing fields.',
  subcommands: [
    defineCommand({
      name: 'list',
      summary: 'List operation names, input schemas and effects',
      run: async (_inv, ctx) => {
        ctx.out.result({ schema_version: 1, operations: WORKSPACE_OPERATIONS }, () =>
          ctx.out.table(
            [{ header: 'OPERATION' }, { header: 'EFFECT' }, { header: 'DESCRIPTION' }],
            WORKSPACE_OPERATIONS.map((op) => [op.name, op.effect, op.description])
          )
        )
        return 0
      },
    }),
    defineCommand({
      name: 'call',
      summary: 'Execute one named operation',
      positionals: [{ name: 'operation', description: 'Name from control list', required: true }],
      options: {
        'input': { type: 'string', description: 'JSON object or @file.json', placeholder: 'json' },
        'non-interactive': {
          type: 'boolean',
          description: 'Never prompt (calls already fail with a field error when incomplete)',
        },
      },
      examples: [
        'atc control call api.ping --json',
        'atc control call models.plan --input @model.json --json',
      ],
      run: async (inv, ctx) => operation(ctx, inv.positionals[0]!, await inputFile(ctx, inv.values['input'])),
    }),
    defineCommand({
      name: 'watch',
      summary: 'Stream sanitized workspace state as NDJSON',
      options: {
        count: {
          type: 'string',
          description: 'Snapshots before exit; 0 follows until interrupted',
          default: '0',
        },
        interval: {
          type: 'string',
          description: 'Polling interval in milliseconds (250–60000)',
          default: '1000',
        },
      },
      run: async (inv, ctx) => {
        const count = Number(inv.values['count']),
          interval = Number(inv.values['interval'])
        if (
          !Number.isSafeInteger(count) ||
          count < 0 ||
          !Number.isInteger(interval) ||
          interval < 250 ||
          interval > 60000
        )
          throw new AtcError('ATC_USAGE', 'Use a nonnegative count and an interval from 250 to 60000 ms.')
        const service = await workspace(ctx, false)
        for (let n = 0; !ctx.signal.aborted && (count === 0 || n < count); n++) {
          ctx.io.stdout(JSON.stringify({ schema_version: 1, snapshot: await service.snapshot() }) + '\n')
          if (count > 0 && n + 1 === count) break
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer)
              ctx.signal.removeEventListener('abort', finish)
              resolve()
            }
            const timer = setTimeout(finish, interval)
            ctx.signal.addEventListener('abort', finish, { once: true })
          })
        }
        return 0
      },
    }),
  ],
})
