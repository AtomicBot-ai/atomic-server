import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import { AtcError, defineCommand } from '../cli/index.js'
import { operation } from './control.js'
import { installManagedEngine, removeManagedEngine } from './managed-engine.js'

const isManaged = (engine: string | undefined) =>
  engine !== undefined && (ENGINE_KINDS as Readonly<Record<string, string>>)[engine] === 'managed'
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
      description:
        'A managed engine (tensorrt-llm, vllm, sglang) is set up by a durable operation in the server after you agree to its plan: on a terminal you are asked; --yes agrees to the plan this command prints, --approve to the plan with that digest only. Ctrl-C and --detach leave the operation running; --resume follows it again.',
      positionals: [{ name: 'engine', description: 'Engine ID; default llamacpp-upstream' }],
      options: {
        'dry-run': {
          type: 'boolean',
          description: 'Show compatible builds, or a managed engine’s plan, only',
        },
        'build': { type: 'string', description: 'Version/variant for llama.cpp' },
        'approve': {
          type: 'string',
          description: 'Agree to the managed plan with this digest only',
          placeholder: 'sha256:digest',
        },
        'detach': { type: 'boolean', description: 'Start or continue the operation without following it' },
        'resume': {
          type: 'string',
          description: 'Continue and follow this operation',
          placeholder: 'operation',
        },
        'cancel': {
          type: 'string',
          description: 'Ask the server to cancel this operation',
          placeholder: 'operation',
        },
        'request-id': { type: 'string', description: 'Stable ID that makes a retry join the same operation' },
      },
      examples: [
        'atc engines install vllm',
        'atc engines install tensorrt-llm --approve sha256:<digest>',
        'atc engines install --resume <operation>',
      ],
      run: (inv, ctx) => {
        if (
          typeof inv.values['resume'] === 'string' ||
          typeof inv.values['cancel'] === 'string' ||
          isManaged(inv.positionals[0])
        )
          return installManagedEngine(ctx, inv.positionals[0], inv.values)
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
      description:
        'A managed engine is removed whole by a durable operation after you agree to it; the shared model store stays while another managed engine is installed, or with --keep-models.',
      positionals: [{ name: 'engine', description: 'Engine ID', required: true }],
      options: {
        'build': { type: 'string', description: 'Required version/variant (not for a managed engine)' },
        'keep-models': { type: 'boolean', description: 'Keep the shared model store of a managed engine' },
        'detach': { type: 'boolean', description: 'Start the removal without following it' },
        'request-id': { type: 'string', description: 'Stable ID that makes a retry join the same operation' },
      },
      run: async (inv, ctx) => {
        if (isManaged(inv.positionals[0])) return removeManagedEngine(ctx, inv.positionals[0]!, inv.values)
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
