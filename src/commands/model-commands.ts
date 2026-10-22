import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { operation, workspace } from './control.js'
import { listInstalled, removeInstalled } from './installed-models.js'
import { modelLogs, runModel } from './managed-run.js'
import { foundryListing, pullFoundryModel } from './foundry-commands.js'
import { litertListing } from './litert-commands.js'
import { isNoGguf } from '../terminal-setup/index.js'
import { checkModelCommand, managedListing, noGgufHint, pullManagedModel } from './managed-model-commands.js'

async function provider(ctx: CommandContext, value: unknown): Promise<string> {
  if (typeof value === 'string') return value
  const configured = (await ctx.config()).values.engines.default
  return configured
}
/**
 * The engine a load goes to: the one named, else `engines.default` once the host is known to register
 * it, so a default this machine lacks (vLLM on macOS) is said here rather than by a failed load.
 */
async function loadProvider(ctx: CommandContext, value: unknown, service: WorkspaceClient): Promise<string> {
  const chosen = await provider(ctx, value)
  if (typeof value === 'string' || !(chosen in ENGINE_KINDS)) return chosen
  const { engines } = (await service.execute('engines.list')) as EngineVersionsResponse
  if (engines.some((e) => e.engine === chosen)) return chosen
  throw new AtcError('ATC_USAGE', `The default engine ${chosen} is not available on this machine.`, {
    hint: `Name one with --engine (${engines.map((e) => e.engine).join(', ')}), or change engines.default.`,
  })
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
  run: (inv, ctx) =>
    runModel(ctx, inv.positionals[0]!, inv.values, (service) =>
      loadProvider(ctx, inv.values['engine'], service)
    ),
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
        ...engineOption,
      },
      run: (inv, ctx) =>
        inv.values['engine'] === 'litert-lm'
          ? litertListing(ctx, 'models.catalog')
          : typeof inv.values['engine'] === 'string'
            ? managedListing(ctx, 'models.catalog', { engine: inv.values['engine'] })
            : operation(ctx, 'models.catalog', { category: inv.values['category'] }),
    }),
    defineCommand({
      name: 'search',
      summary: 'Search model repositories',
      positionals: [
        {
          name: 'query',
          description: 'Search words or owner/repo (optional for foundry-local and litert-lm)',
        },
      ],
      options: engineOption,
      run: (inv, ctx) =>
        inv.values['engine'] === 'foundry-local'
          ? foundryListing(ctx, inv.positionals[0] ?? '')
          : inv.values['engine'] === 'litert-lm'
            ? litertListing(ctx, 'models.search', inv.positionals[0] ?? '')
            : !inv.positionals[0]
              ? Promise.reject(new AtcError('ATC_USAGE', 'Name what to search for.'))
              : typeof inv.values['engine'] === 'string'
                ? managedListing(ctx, 'models.search', {
                    engine: inv.values['engine'],
                    query: inv.positionals[0],
                  })
                : operation(ctx, 'models.search', { query: inv.positionals[0] }),
    }),
    checkModelCommand,
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
        if (!inv.values['loaded']) return listInstalled(ctx)
        const rows = (await (await workspace(ctx)).snapshot()).services
        ctx.out.result({ services: rows }, () => ctx.out.line(JSON.stringify(rows, null, 2)))
        return 0
      },
    }),
    defineCommand({
      name: 'pull',
      summary: 'Plan and start a durable download: GGUF, or with --engine a managed checkpoint',
      positionals: [
        { name: 'model', description: 'owner/repo[:file.gguf], or owner/repo[@revision] with --engine' },
      ],
      options: {
        'engine': {
          type: 'string',
          description: 'A managed engine: download the safetensors checkpoint into its shared store',
          placeholder: 'engine',
        },
        'detach': { type: 'boolean', description: 'Start a managed download without following it' },
        'device': {
          type: 'string',
          description: 'Foundry Local: the variant for npu, gpu or cpu',
          placeholder: 'device',
        },
        'cancel': {
          type: 'string',
          description: 'Cancel a managed or Foundry Local download (with its --engine)',
          placeholder: 'request-id',
        },
        'file': { type: 'string', description: 'Exact filename in the repository' },
        'quant': { type: 'string', description: 'Select an unambiguous quantization' },
        'mmproj': { type: 'boolean', description: 'Include required vision projector', default: true },
        'dry-run': { type: 'boolean', description: 'Return the install plan without downloading' },
        'request-id': { type: 'string', description: 'Stable ID reused when retrying this installation' },
      },
      run: async (inv, ctx) => {
        if (typeof inv.values['cancel'] === 'string')
          return operation(
            ctx,
            inv.values['engine'] === 'foundry-local' ? 'foundry.cancel' : 'managed.cancel',
            {
              id: inv.values['cancel'],
            }
          )
        if (!inv.positionals[0]) throw new AtcError('ATC_USAGE', 'Name the model to download.')
        if (inv.values['engine'] === 'foundry-local')
          return pullFoundryModel(ctx, inv.positionals[0], inv.values)
        if (
          typeof inv.values['engine'] === 'string' &&
          ENGINE_KINDS[inv.values['engine'] as EngineId] === 'managed'
        )
          return pullManagedModel(ctx, inv.positionals[0], inv.values['engine'], inv.values)
        const raw = inv.positionals[0]!,
          colon = raw.indexOf(':')
        const repo = colon < 0 ? raw : raw.slice(0, colon)
        let file =
          typeof inv.values['file'] === 'string' ? inv.values['file'] : colon < 0 ? '' : raw.slice(colon + 1)
        const service = await workspace(ctx)
        if (!file) {
          const result = (await service.execute('models.files', { repo }).catch((error: unknown) => {
            // A repository without GGUF files: maybe a managed engine's safetensors checkpoint.
            if (isNoGguf(error)) return []
            throw error
          })) as unknown
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
          if (files.length === 0) return noGgufHint(ctx, service, repo)
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
      name: 'logs',
      summary: 'The log of a loaded managed model, or of its last failed load',
      positionals: [{ name: 'model', description: 'Model ID', required: true }],
      options: engineOption,
      run: async (inv, ctx) => modelLogs(ctx, inv.positionals[0]!, await provider(ctx, inv.values['engine'])),
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
      run: (inv, ctx) => removeInstalled(ctx, inv.positionals[0]!),
    }),
  ],
})
