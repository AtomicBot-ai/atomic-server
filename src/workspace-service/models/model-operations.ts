/**
 * The `models.*` operations of the workspace: the catalog, Hub search (Foundry Local's and LiteRT-LM's
 * models among them), installed models of every provider (Foundry Local variants among them), removal
 * and import. `NOT_CORE` for any other name, and for a removal that is the core's
 * (a model of the managed store).
 */

import { searchCatalog } from './catalog-search.js'
import { randomUUID } from 'node:crypto'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { AtomicCoreError } from '@atomic-chat/core'
import { ModelRegistry } from '@atomic-chat/core/models'
import type { WorkspaceInput } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { installedModels, modelFiles } from '../../terminal-setup/index.js'
import type { WorkspaceCatalog } from './catalog.js'
import type { CatalogCategory } from './catalog.js'
import type { ManagedModelSetups } from '../managed/managed-model-setups.js'
import { foundrySearch } from '../foundry/foundry-catalog.js'
import { liteRtSearch } from '../litert/litert-catalog.js'
import { managedCatalog, managedSearch } from '../managed/managed-catalog.js'
import { isManagedEngine } from '../engines/managed-engines.js'
import { checkModel, hubOf } from '../managed/managed-models.js'
import { storeModels } from './managed-store.js'
import { registeredEngines, withProviders } from './model-providers.js'
import { foundryStoreModels, removeFoundryModel } from '../foundry/foundry-store.js'
import { liteRtStoreModels, removeLiteRtModel } from '../litert/litert-store.js'
import { NOT_CORE } from '../not-core.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { importedModelId, modelIdPath, segment } from '../validation.js'
import { engineLogTail } from '../workspace-logs.js'

/** Lines of an engine's output `models.logs` returns for a model without a container. */
const ENGINE_LOG_LINES = 200

export interface ModelOperationDeps {
  options: WorkspaceServiceOptions
  catalog: WorkspaceCatalog
  request: typeof fetch
  managed: ManagedModelSetups
}

/** LiteRT-LM's catalog and search: conf's list (`ATC_LITERT_LM_MODELS_URL`), the Hub with `HF_TOKEN`. */
function liteRtDeps(d: ModelOperationDeps) {
  const { link, paths, env } = d.options
  return {
    link,
    fetch: d.request,
    list: {
      cachePath: join(paths.atcDir, 'cache', 'litert-lm-models.json'),
      url: env?.['ATC_LITERT_LM_MODELS_URL'],
    },
    platform: d.options.platform ?? process.platform,
    arch: d.options.arch ?? process.arch,
    hub: hubOf(env),
    token: env?.['HF_TOKEN'],
  }
}

export async function modelOperation(
  d: ModelOperationDeps,
  operation: string,
  input: WorkspaceInput
): Promise<unknown> {
  const { link, paths } = d.options
  switch (operation) {
    case 'models.logs': {
      // A container keeps its own log in the core; every other engine's output is in atc's engines log.
      const provider = segment(input['provider']),
        model = String(input['model_id'])
      return link.request('GET', `/models/${provider}/${modelIdPath(model)}/logs`).catch((e: unknown) => {
        if (e instanceof AtomicCoreError && e.code === 'INVALID_ARGUMENT')
          return engineLogTail(paths.engineLog, provider, model, ENGINE_LOG_LINES)
        throw e
      })
    }
    case 'managed.plan':
      return d.managed.plan({
        repository: String(input['repository']),
        engine: String(input['engine']),
        ...(typeof input['revision'] === 'string' ? { revision: input['revision'] } : {}),
      })
    case 'managed.install':
      return d.managed.install(input)
    case 'managed.cancel':
      return d.managed.cancel(String(input['id']))
    case 'managed.list':
      return d.managed.list()
    case 'models.check':
      return checkModel(
        { link, fetch: d.request, env: d.options.env },
        {
          repository: String(input['repository']),
          ...(typeof input['revision'] === 'string' ? { revision: input['revision'] } : {}),
          ...(typeof input['engine'] === 'string' ? { engine: input['engine'] } : {}),
        }
      )
    case 'models.catalog':
      if (input['engine'] === 'litert-lm') return liteRtSearch(liteRtDeps(d), { huggingface: false })
      if (isManagedEngine(String(input['engine'] ?? ''))) return managedCatalog(link, String(input['engine']))
      return d.catalog.list(
        input['category'] as CatalogCategory | undefined,
        String(input['query'] ?? ''),
        input['refresh'] === true
      )
    case 'models.search':
      if (input['engine'] === 'litert-lm')
        return liteRtSearch(liteRtDeps(d), { query: String(input['query'] ?? ''), huggingface: true })
      if (input['engine'] === 'foundry-local')
        return foundrySearch(
          {
            link,
            fetch: d.request,
            list: {
              cachePath: join(paths.atcDir, 'cache', 'foundry-local-models.json'),
              url: d.options.env?.['ATC_FOUNDRY_LOCAL_MODELS_URL'],
            },
            platform: d.options.platform ?? process.platform,
            arch: d.options.arch ?? process.arch,
          },
          String(input['query'] ?? '')
        )
      if (isManagedEngine(String(input['engine'] ?? '')))
        return managedSearch(
          { link, fetch: d.request, env: d.options.env },
          String(input['engine']),
          String(input['query'])
        )
      return searchCatalog(d.catalog, String(input['query'] ?? ''), d.request, input['engine'] === 'mlx')
    case 'models.files':
      return modelFiles(String(input['repo']), d.request)
    case 'models.installed': {
      // One read of the registered engines serves the store's providers and everyone else's.
      const registered = await registeredEngines(link)
      return withProviders(
        link,
        paths.layout,
        [
          ...(await installedModels(paths.layout)),
          ...(await new ModelRegistry(paths.layout, 'mlx').list()).map((m) => ({
            id: m.id,
            name: String(m.yml.name ?? m.id),
            provider: 'mlx',
          })),
          ...(await storeModels(link, registered ?? undefined)),
          ...(await foundryStoreModels(paths.layout)),
          ...(await liteRtStoreModels(paths.layout)),
        ],
        registered
      )
    }
    case 'models.remove': {
      const id = String(input['model_id']),
        local = new ModelRegistry(paths.layout),
        mlx = new ModelRegistry(paths.layout, 'mlx'),
        entry = await local.find(id),
        registry = entry ? local : mlx
      if (!entry && !(await mlx.find(id)))
        return (
          (await removeFoundryModel(link, paths.layout, id)) ??
          (await removeLiteRtModel(link, paths.layout, id)) ??
          NOT_CORE
        )
      if ((await link.models.sessions()).some((s) => s.model_id === id))
        throw new AtcError('ATC_USAGE', 'Unload this model before removing it.')
      await registry.remove(id)
      return { removed: true, model_id: id }
    }
    case 'models.import': {
      // The daemon's working directory means nothing to the caller; CLI resolves against its own.
      if (!isAbsolute(String(input['path'])))
        throw new AtcError('ATC_USAGE', 'Use an absolute path to the GGUF file.')
      const path = resolve(String(input['path'])),
        validation = await link.request<{ isValid: boolean; error?: string }>('POST', '/gguf/validate', {
          path,
        })
      if (!validation.isValid)
        throw new AtcError('ATC_USAGE', validation.error ?? 'This file is not a GGUF model.')
      const id = importedModelId(path, randomUUID())
      await new ModelRegistry(paths.layout).write(id, { model_path: path, name: basename(path, '.gguf') })
      return { model_id: id, path }
    }
  }
  return NOT_CORE
}
