import { AtcError, defineCommand } from '../cli/index.js'
import { operation } from './control.js'
export const keyCommand = defineCommand({
  name: 'key',
  summary: 'Named client API keys',
  subcommands: [
    defineCommand({
      name: 'list',
      summary: 'List masked keys',
      run: (_inv, ctx) => operation(ctx, 'keys.list'),
    }),
    defineCommand({
      name: 'show',
      summary: 'Show masked keys or explicitly reveal one',
      options: {
        reveal: { type: 'boolean', description: 'Print the selected key in full' },
        id: { type: 'string', description: 'Key ID; default first key' },
      },
      run: (inv, ctx) =>
        operation(
          ctx,
          inv.values['reveal'] ? 'keys.reveal' : 'keys.list',
          inv.values['reveal'] && inv.values['id'] ? { id: inv.values['id'] } : {}
        ),
    }),
    defineCommand({
      name: 'create',
      summary: 'Create a named key and return its value',
      positionals: [{ name: 'name', description: 'Client or agent name', required: true }],
      run: (inv, ctx) => operation(ctx, 'keys.create', { name: inv.positionals[0] }),
    }),
    defineCommand({
      name: 'revoke',
      summary: 'Revoke a client key immediately',
      positionals: [{ name: 'id', description: 'Key ID', required: true }],
      run: async (inv, ctx) => {
        if (!(await ctx.prompt.confirm(`Revoke key ${inv.positionals[0]}?`, { danger: true }))) return 0
        return operation(ctx, 'keys.revoke', { id: inv.positionals[0] })
      },
    }),
    defineCommand({
      name: 'rotate',
      summary: 'Create a replacement key; old keys stay valid until revoked',
      options: { name: { type: 'string', description: 'Replacement key name', default: 'Replacement key' } },
      run: (inv, ctx) => {
        if (typeof inv.values['name'] !== 'string') throw new AtcError('ATC_USAGE', 'Supply a key name.')
        return operation(ctx, 'keys.create', { name: inv.values['name'] })
      },
    }),
  ],
})
