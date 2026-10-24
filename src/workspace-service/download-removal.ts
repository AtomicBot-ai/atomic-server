import { modelIdPath } from './validation.js'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ModelRegistry } from '@atomic-chat/core/models'
import { discardDownloadFiles } from '../downloads/index.js'
import { forgetSetupDownload } from '../terminal-setup/index.js'
import { AtcError } from '../errors/index.js'
import type { WorkspaceInput, WorkspaceSnapshot } from '../contract/index.js'
import type { WorkspaceServiceOptions } from './service.js'
import type { modelDownloads } from './model-downloads.js'
import { setupFilePaths } from './model-setup-run.js'
import { underRoot } from './managed-model-plan.js'
import { liteRtFileName } from './litert-model-plan.js'

type Downloads = Omit<ReturnType<typeof modelDownloads>, 'downloader'>
const completed = () => {
  throw new AtcError('ATC_USAGE', 'This model is installed. Delete it from Installed models.')
}
/** A store of downloads that finish as a model the core registers (GGUF setups, managed, Foundry, LiteRT-LM). */
interface CoreModelStore<J> {
  remove(id: string, cleanup: (job: J) => Promise<void>): Promise<unknown>
  list(): Promise<J[]>
  /** The job's id in `list()`, and the request id its setup record is kept under. */
  id(job: J): string
  request(job: J): string
  /** The core has the model already: it is deleted through the core, never as a partial download. */
  registered(job: J): Promise<boolean>
  model(job: J): string
  /** The folder its files must stay inside, and its files. */
  root(job: J): string
  files(job: J): string[]
}
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  )

async function removeCoreModel<J>(
  store: CoreModelStore<J>,
  id: string,
  options: WorkspaceServiceOptions,
  installed: boolean
) {
  return store.remove(id, async (job) => {
    if (await store.registered(job)) {
      if (!installed) completed()
      await options.link.request('DELETE', `/managed-models/${modelIdPath(store.model(job))}`)
    } else {
      const others = (await store.list()).filter((other) => store.id(other) !== id)
      await discardDownloadFiles(
        store.root(job),
        store.files(job),
        others.flatMap((other) => store.files(other))
      )
    }
    await forgetSetupDownload(options.paths.atcDir, store.request(job))
  })
}

/** Removing a transfer is distinct from pausing: wait for file handles, then discard owned bytes. */
export async function removeDownload(
  downloads: Downloads,
  options: WorkspaceServiceOptions,
  input: WorkspaceInput,
  getSnapshot: () => Promise<Pick<WorkspaceSnapshot, 'services' | 'errors'>>
) {
  const id = String(input['id']),
    owner = String(input['owner']),
    root = options.paths.dataFolder,
    installed = input['installed'] === true
  const { setups, artifacts, managed, foundry, litert } = downloads
  // core-boundary: model.yml — a finished registration (managed store, Foundry, LiteRT-LM) is protected from partial-download removal
  const registeredIn = (dir: string) => exists(join(dir, 'model.yml'))
  if (owner === 'setup')
    return removeCoreModel(
      {
        remove: (i, c) => setups.remove(i, c),
        list: () => setups.list(),
        id: (job) => job.setup_id,
        request: (job) => job.request_id,
        registered: async (job) =>
          job.stage === 'ready' ||
          Boolean(await new ModelRegistry(options.paths.layout).find(job.plan.model_id)),
        model: (job) => job.plan.model_id,
        root: () => root,
        files: (job) => Object.values(setupFilePaths(options.paths, job.plan)),
      },
      id,
      options,
      installed
    )
  if (owner === 'managed')
    return removeCoreModel(
      {
        remove: (i, c) => managed.remove(i, c),
        list: () => managed.list(),
        id: (job) => job.id,
        request: (job) => job.id,
        registered: async ({ stage, plan }) =>
          stage === 'ready' ||
          plan.present ||
          (await exists(underRoot(plan.root, plan.repository, 'model.yml'))),
        model: (job) => job.plan.repository,
        root: (job) => job.plan.root,
        files: ({ plan }) => plan.files.map((file) => underRoot(plan.root, plan.repository, file.path)),
      },
      id,
      options,
      installed
    )
  if (owner === 'foundry')
    return removeCoreModel(
      {
        remove: (i, c) => foundry.remove(i, c),
        list: () => foundry.list(),
        id: (job) => job.id,
        request: (job) => job.id,
        registered: async (job) => job.stage === 'ready' || (await registeredIn(job.plan.dir)),
        model: (job) => job.plan.variant_id,
        root: () => root,
        files: ({ plan }) => plan.files.map((file) => underRoot(plan.dir, file.path)),
      },
      id,
      options,
      installed
    )
  if (owner === 'litert')
    return removeCoreModel(
      {
        remove: (i, c) => litert.models.remove(i, c),
        list: () => litert.models.list(),
        id: (job) => job.id,
        request: (job) => job.id,
        registered: async (job) => job.stage === 'ready' || (await registeredIn(job.plan.dir)),
        model: (job) => job.plan.variant_id,
        root: () => root,
        files: ({ plan }) => [underRoot(plan.dir, liteRtFileName(plan.file.path))],
      },
      id,
      options,
      installed
    )
  if (owner === 'artifacts')
    return artifacts.remove(id, async (job) => {
      const registeredMlx =
        job.plan.engine === 'mlx' &&
        (await new ModelRegistry(options.paths.layout, 'mlx').find(job.plan.model_id))
      if ((job.stage === 'ready' || registeredMlx) && !installed) completed()
      const snapshot = await getSnapshot()
      const kind = ['image', 'video'].includes(job.plan.category) ? 'image-video' : job.plan.category
      if (snapshot.services.some((s) => s.model === job.plan.model_id || (s.kind === kind && s.model === '')))
        throw new AtcError('ATC_USAGE', 'Unload this model before deleting it.')
      if (snapshot.errors.some((error) => error.source === kind))
        throw new AtcError(
          'ATC_USAGE',
          'Could not check whether this model is loaded. Retry after the engine responds.'
        )
      const others = (await artifacts.list()).filter((other) => other.id !== id)
      await discardDownloadFiles(
        root,
        job.plan.files.map((file) => file.save_path),
        others.flatMap((other) => other.plan.files.map((file) => file.save_path))
      )
      if (
        job.plan.engine === 'mlx' &&
        !others.some((other) => other.plan.model_id === job.plan.model_id) &&
        (await new ModelRegistry(options.paths.layout, 'mlx').find(job.plan.model_id))
      )
        await new ModelRegistry(options.paths.layout, 'mlx').remove(job.plan.model_id)
    })
  throw new AtcError('ATC_USAGE', 'This download cannot be removed here.')
}
