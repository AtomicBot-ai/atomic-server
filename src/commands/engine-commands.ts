import { AtcError, defineCommand } from '../cli/index.js'
import { operation } from './control.js'
export const enginesCommand = defineCommand({
  name: 'engines',
  summary: 'Discover and manage engine builds',
  group: 'models',
  subcommands: [
    defineCommand({
      name: 'list',
      summary: 'Installed and available engine builds',
      run: (_inv, ctx) => operation(ctx, 'engines.list'),
    }),
    defineCommand({
      name: 'status',
      summary: 'Engine versions and residency',
      run: (_inv, ctx) => operation(ctx, 'engines.list'),
    }),
    defineCommand({
      name: 'catalog',
      summary: 'Compatible builds for an engine',
      positionals: [{ name: 'engine', description: 'Engine ID', required: true }],
      run: (inv, ctx) => operation(ctx, 'engines.catalog', { engine: inv.positionals[0] }),
    }),
    defineCommand({
      name: 'install',
      summary: 'Install a compatible engine build',
      positionals: [{ name: 'engine', description: 'Engine ID; default llamacpp-upstream' }],
      options: {
        'dry-run': { type: 'boolean', description: 'Show compatible builds only' },
        'build': { type: 'string', description: 'Version/variant for llama.cpp' },
      },
      run: (inv, ctx) => {
        const engine = inv.positionals[0] ?? 'llamacpp-upstream'
        if (inv.values['dry-run']) return operation(ctx, 'engines.catalog', { engine })
        let request = {}
        if (typeof inv.values['build'] === 'string') {
          const [version, ...variant] = inv.values['build'].split('/')
          if (!version || !variant.length) throw new AtcError('ATC_USAGE', 'Use --build version/variant.')
          request = { target: { version, variant: variant.join('/') } }
        }
        return operation(ctx, 'engines.install', { engine, request })
      },
    }),
    defineCommand({
      name: 'rm',
      summary: 'Remove one unused engine build',
      positionals: [{ name: 'engine', description: 'Engine ID', required: true }],
      options: { build: { type: 'string', description: 'Required version/variant' } },
      run: async (inv, ctx) => {
        const [version, ...variant] = String(inv.values['build'] ?? '').split('/')
        if (!version || !variant.length)
          throw new AtcError('ATC_USAGE', 'Choose --build version/variant from engines list.')
        if (
          !(await ctx.prompt.confirm(`Remove ${inv.positionals[0]} ${inv.values['build']}?`, {
            danger: true,
          }))
        )
          return 0
        return operation(ctx, 'engines.remove', {
          engine: inv.positionals[0],
          version,
          variant: variant.join('/'),
        })
      },
    }),
  ],
})
export const hardwareCommand = defineCommand({
  name: 'hardware',
  summary: 'Hardware facts and engine devices',
  group: 'models',
  subcommands: [
    defineCommand({
      name: 'show',
      summary: 'Show detected hardware',
      run: (_inv, ctx) => operation(ctx, 'hardware.info'),
    }),
    defineCommand({
      name: 'refresh',
      summary: 'Refresh detected hardware',
      run: (_inv, ctx) => operation(ctx, 'hardware.refresh'),
    }),
  ],
})
