/**
 * The `models.*` operations of the workspace: the catalog, Hub search, installed models of every
 * provider, removal and import. `NOT_CORE` for any other name, and for a removal that is the core's
 * (a model of the managed store).
 */

import { randomUUID } from 'node:crypto'
import { basename, isAbsolute, resolve } from 'node:path'
import { ModelRegistry } from '@atomic-chat/core/models'
import type { WorkspaceInput } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { installedModels, modelFiles, searchHub } from '../terminal-setup/index.js'
import type { WorkspaceCatalog } from './catalog.js'
import type { CatalogCategory } from './catalog.js'
import type { ManagedModelSetups } from './managed-model-setups.js'
import { checkModel } from './managed-models.js'
import { NOT_CORE } from './not-core.js'
import type { WorkspaceServiceOptions } from './service.js'
import { importedModelId } from './validation.js'

export interface ModelOperationDeps {
  options: WorkspaceServiceOptions
  catalog: WorkspaceCatalog
  request: typeof fetch
  managed: ManagedModelSetups
}

export async function modelOperation(
  d: ModelOperationDeps,
  operation: string,
  input: WorkspaceInput
): Promise<unknown> {
  const { link, paths } = d.options
  switch (operation) {
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
      return d.catalog.list(
        input['category'] as CatalogCategory | undefined,
        String(input['query'] ?? ''),
        input['refresh'] === true
      )
    case 'models.search':
      return searchHub(String(input['query']), d.request)
    case 'models.files':
      return modelFiles(String(input['repo']), d.request)
    case 'models.installed':
      return [
        ...(await installedModels(paths.layout)),
        ...(await new ModelRegistry(paths.layout, 'mlx').list()).map((m) => ({
          id: m.id,
          name: String(m.yml.name ?? m.id),
          provider: 'mlx',
        })),
      ]
    case 'models.remove': {
      const id = String(input['model_id']),
        local = new ModelRegistry(paths.layout),
        mlx = new ModelRegistry(paths.layout, 'mlx'),
        entry = await local.find(id),
        registry = entry ? local : mlx
      if (!entry && !(await mlx.find(id))) return NOT_CORE
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
