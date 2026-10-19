import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { operation, workspace } from './control.js'

async function provider(ctx: CommandContext, value: unknown): Promise<string> {
  if (typeof value === 'string') return value
  const configured = (await ctx.config()).values.engines.default
  return configured
}
const engineOption = {
  engine: { type: 'string' as const, description: 'Engine provider ID', placeholder: 'provider' },
}
export const runCommand = defineCommand({
  name: 'run',
  summary: 'Load a downloaded model',
  group: 'models',
  positionals: [{ name: 'model', description: 'Installed model ID', required: true }],
  options: {
    ...engineOption,
    embedding: { type: 'boolean', description: 'Use embedding mode on a compatible engine' },
  },
  run: async (inv, ctx) =>
    operation(ctx, 'models.load', {
      provider: await provider(ctx, inv.values['engine']),
      model_id: inv.positionals[0],
      ...(inv.values['embedding'] ? { options: { isEmbedding: true } } : {}),
    }),
})
export const unloadCommand = defineCommand({
  name: 'unload',
  summary: 'Unload a model; keep its files and server running',
  group: 'models',
  positionals: [{ name: 'model', description: 'Running model ID' }],
  options: { ...engineOption, all: { type: 'boolean', description: 'Unload all chat sessions' } },
  run: async (inv, ctx) => {
    const service = await workspace(ctx)
    const snapshot = await service.snapshot()
    const rows = snapshot.services.filter(
      (s) => s.kind === 'chat' && (inv.values['all'] || s.model === inv.positionals[0])
    )
    if (!inv.values['all'] && !inv.positionals[0])
      throw new AtcError('ATC_USAGE', 'Name a model or use --all.')
    if (!inv.values['all'] && !rows.length)
      return operation(ctx, 'models.unload', {
        provider: await provider(ctx, inv.values['engine']),
        model_id: inv.positionals[0],
      })
    const result = []
    for (const row of rows)
      result.push(await service.execute('models.unload', { provider: row.provider, model_id: row.model }))
    ctx.out.result({ unloaded: result.length }, () => ctx.out.line(`Unloaded ${result.length} model(s).`))
    return 0
  },
})
export const modelsCommand = defineCommand({
  name: 'models',
  summary: 'Discover, download and manage model files',
  group: 'models',
  subcommands: [
    defineCommand({
      name: 'catalog',
      summary: 'Browse Atomic model picks by task',
      options: {
        category: {
          type: 'string',
          description: 'text, image, video, embedding or decision',
          default: 'text',
        },
      },
      run: (inv, ctx) => operation(ctx, 'models.catalog', { category: inv.values['category'] }),
    }),
    defineCommand({
      name: 'search',
      summary: 'Search model repositories',
      positionals: [{ name: 'query', description: 'Search words or owner/repo', required: true }],
      run: (inv, ctx) => operation(ctx, 'models.search', { query: inv.positionals[0] }),
    }),
    defineCommand({
      name: 'files',
      summary: 'List downloadable GGUF files',
      positionals: [{ name: 'repo', description: 'owner/repo', required: true }],
      run: (inv, ctx) => operation(ctx, 'models.files', { repo: inv.positionals[0] }),
    }),
    defineCommand({
      name: 'list',
      summary: 'Installed models',
      options: { loaded: { type: 'boolean', description: 'Only running services' } },
      run: async (inv, ctx) => {
        if (!inv.values['loaded']) return operation(ctx, 'models.installed')
        const rows = (await (await workspace(ctx)).snapshot()).services
        ctx.out.result({ services: rows }, () => ctx.out.line(JSON.stringify(rows, null, 2)))
        return 0
      },
    }),
    defineCommand({
      name: 'pull',
      summary: 'Plan and start a durable GGUF download',
      positionals: [{ name: 'model', description: 'owner/repo[:file.gguf]', required: true }],
      options: {
        'file': { type: 'string', description: 'Exact filename in the repository' },
        'quant': { type: 'string', description: 'Select an unambiguous quantization' },
        'mmproj': { type: 'boolean', description: 'Include required vision projector', default: true },
        'dry-run': { type: 'boolean', description: 'Return the install plan without downloading' },
        'request-id': { type: 'string', description: 'Stable ID reused when retrying this installation' },
      },
      run: async (inv, ctx) => {
        const raw = inv.positionals[0]!,
          colon = raw.indexOf(':')
        const repo = colon < 0 ? raw : raw.slice(0, colon)
        let file =
          typeof inv.values['file'] === 'string' ? inv.values['file'] : colon < 0 ? '' : raw.slice(colon + 1)
        const service = await workspace(ctx)
        if (!file) {
          const result = (await service.execute('models.files', { repo })) as unknown
          const files = Array.isArray(result) ? result : ((result as { files?: unknown[] }).files ?? [])
          const quant = String(inv.values['quant'] ?? '').toLowerCase()
          const matches = files.filter(
            (v): v is { filename: string } =>
              !!v &&
              typeof v === 'object' &&
              'filename' in v &&
              typeof v.filename === 'string' &&
              !/mmproj/i.test(v.filename) &&
              (!quant || v.filename.toLowerCase().includes(quant))
          )
          if (matches.length !== 1)
            throw new AtcError('ATC_USAGE', 'Choose an exact model file.', {
              hint: `Run atc models files ${repo}, then use --file filename.gguf.`,
            })
          file = matches[0]!.filename
        }
        const request = { repo, file, include_projector: inv.values['mmproj'] !== false }
        const plan = (await service.execute('models.plan', request)) as {
          digest: string
          blockers?: { message: string }[]
        }
        if (plan.blockers?.length && !inv.values['dry-run'])
          throw new AtcError('ATC_USAGE', plan.blockers.map((b) => b.message).join(' '))
        const result = inv.values['dry-run']
          ? plan
          : await service.execute('models.install', {
              request,
              plan_digest: plan.digest,
              request_id: inv.values['request-id'] ?? randomUUID(),
            })
        ctx.out.result(result, () => ctx.out.line(JSON.stringify(result, null, 2)))
        return 0
      },
    }),
    defineCommand({
      name: 'import',
      summary: 'Validate and register a local GGUF',
      positionals: [{ name: 'path', description: 'Model file path', required: true }],
      // The server may run from any folder: resolve here, where the user's working directory is known.
      run: (inv, ctx) => operation(ctx, 'models.import', { path: resolve(ctx.io.cwd, inv.positionals[0]!) }),
    }),
    defineCommand({
      name: 'info',
      summary: 'Model capabilities on its engine',
      positionals: [{ name: 'model', description: 'Model ID', required: true }],
      options: engineOption,
      run: async (inv, ctx) =>
        operation(ctx, 'models.info', {
          provider: await provider(ctx, inv.values['engine']),
          model_id: inv.positionals[0],
        }),
    }),
    defineCommand({
      name: 'rm',
      summary: 'Remove a downloaded model',
      positionals: [{ name: 'model', description: 'Installed model ID', required: true }],
      run: async (inv, ctx) => {
        if (!(await ctx.prompt.confirm(`Delete model ${inv.positionals[0]}?`, { danger: true }))) return 0
        return operation(ctx, 'models.remove', { model_id: inv.positionals[0] })
      },
    }),
  ],
})
