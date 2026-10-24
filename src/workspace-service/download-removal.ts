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

type Downloads = Omit<ReturnType<typeof modelDownloads>, 'downloader'>
const completed = () => {
  throw new AtcError('ATC_USAGE', 'This model is installed. Delete it from Installed models.')
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
    root = options.paths.dataFolder
  const { setups, artifacts, managed, foundry } = downloads
  if (owner === 'setup')
    return setups.remove(id, async (job) => {
      if (job.stage === 'ready' || (await new ModelRegistry(options.paths.layout).find(job.plan.model_id))) {
        if (input['installed'] !== true) completed()
        await options.link.request('DELETE', `/managed-models/${modelIdPath(job.plan.model_id)}`)
        await forgetSetupDownload(options.paths.atcDir, job.request_id)
        return
      }
      const others = (await setups.list()).filter((other) => other.setup_id !== id)
      await discardDownloadFiles(
        root,
        Object.values(setupFilePaths(options.paths, job.plan)),
        others.flatMap((other) => Object.values(setupFilePaths(options.paths, other.plan)))
      )
      await forgetSetupDownload(options.paths.atcDir, job.request_id)
    })
  if (owner === 'artifacts')
    return artifacts.remove(id, async (job) => {
      const registeredMlx =
        job.plan.engine === 'mlx' &&
        (await new ModelRegistry(options.paths.layout, 'mlx').find(job.plan.model_id))
      if ((job.stage === 'ready' || registeredMlx) && input['installed'] !== true) completed()
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
  if (owner === 'managed')
    return managed.remove(id, async (job) => {
      const plan = job.plan
      // core-boundary: model.yml — a finished managed-store registration must be deleted through the core, never as a partial download
      if (
        job.stage === 'ready' ||
        plan.present ||
        (await stat(underRoot(plan.root, plan.repository, 'model.yml')).catch(() => null))
      ) {
        if (input['installed'] !== true) completed()
        await options.link.request('DELETE', `/managed-models/${modelIdPath(plan.repository)}`)
        await forgetSetupDownload(options.paths.atcDir, id)
        return
      }
      const others = (await managed.list()).filter((other) => other.id !== id)
      await discardDownloadFiles(
        plan.root,
        plan.files.map((file) => underRoot(plan.root, plan.repository, file.path)),
        others.flatMap((other) =>
          other.plan.files.map((file) => underRoot(other.plan.root, other.plan.repository, file.path))
        )
      )
      await forgetSetupDownload(options.paths.atcDir, id)
    })
  if (owner === 'foundry')
    return foundry.remove(id, async (job) => {
      const plan = job.plan
      // core-boundary: model.yml — a finished Foundry registration is protected from partial-download removal
      if (job.stage === 'ready' || (await stat(join(plan.dir, 'model.yml')).catch(() => null))) {
        if (input['installed'] !== true) completed()
        await options.link.request('DELETE', `/managed-models/${modelIdPath(plan.variant_id)}`)
        await forgetSetupDownload(options.paths.atcDir, id)
        return
      }
      const others = (await foundry.list()).filter((other) => other.id !== id)
      await discardDownloadFiles(
        root,
        plan.files.map((file) => underRoot(plan.dir, file.path)),
        others.flatMap((other) => other.plan.files.map((file) => underRoot(other.plan.dir, file.path)))
      )
      await forgetSetupDownload(options.paths.atcDir, id)
    })
  throw new AtcError('ATC_USAGE', 'This download cannot be removed here.')
}
