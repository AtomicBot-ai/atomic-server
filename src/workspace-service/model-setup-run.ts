/**
 * The steps of one GGUF setup: the PrismML build through the core (install, then activate), the
 * model and its projector with atc's downloader, `model.yml` in the shared GGUF tree, then the core's
 * verdict on the file on disk by `model_id`. A file the core does not accept is removed again.
 */
import { stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { ModelCompatibilityResponse } from '@atomic-chat/core/contracts'
import { modelDirFromId } from '@atomic-chat/core/host'
import { hfResolveUrl, hfToken, ModelRegistry } from '@atomic-chat/core/models'
import type { AtcPaths } from '../config/index.js'
import type { CoreLink } from '../core-link/index.js'
import type {
  ModelSetup,
  ModelSetupArtifact,
  ModelSetupEngine,
  ModelSetupPlan,
  ModelSetupStage,
} from '../contract/index.js'
import type { Downloader, DownloadItem, ProxyConfig } from '../downloads/index.js'
import { segment } from './validation.js'

export interface SetupRunDeps {
  link: CoreLink
  paths: AtcPaths
  downloader: Downloader
  env: NodeJS.ProcessEnv
  proxy?: ProxyConfig | null
}

/** A stop the user asked for. */
export class SetupCancelled extends Error {
  constructor() {
    super('The model setup was cancelled.')
  }
}

/** Download task ids per stage; the engine's is shared by every setup that needs the same build. */
export function setupTaskIds(setupId: string, plan: ModelSetupPlan): ModelSetup['task_ids'] {
  return {
    ...(plan.engine && !plan.engine.installed
      ? { engine: `atomic-prism-backend-${plan.engine.version}-${plan.engine.backend}` }
      : {}),
    model: `model-setup-${setupId}-model`,
    ...(plan.projector ? { projector: `model-setup-${setupId}-projector` } : {}),
  }
}

/** Data-folder-relative, `/`-separated: as the downloader takes them and `model.yml` stores them. */
function pathsOf(paths: AtcPaths, plan: ModelSetupPlan) {
  const dir = modelDirFromId(paths.layout.provider('llamacpp-upstream').modelsDir, plan.model_id)
  const rel = (file: string) =>
    relative(paths.layout.root, join(dir, file.split('/').pop() ?? file))
      .split(sep)
      .join('/')
  return { model: rel(plan.model.file), ...(plan.projector ? { projector: rel(plan.projector.file) } : {}) }
}

export function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SetupCancelled())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new SetupCancelled())
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export async function runSetup(
  deps: SetupRunDeps,
  record: ModelSetup,
  signal: AbortSignal,
  enter: (stage: ModelSetupStage) => Promise<void>,
  install: (engine: ModelSetupEngine, taskId: string) => Promise<void>
): Promise<void> {
  const { link, paths } = deps
  const { plan, task_ids } = record
  // A build the verdict already accepts is the active one; anything else is made active here.
  if (plan.engine && plan.verdict.outcome !== 'compatible') {
    if (!plan.engine.installed) {
      await enter('installing_engine')
      await raceAbort(install(plan.engine, task_ids.engine ?? ''), signal)
    }
    await link.request(
      'POST',
      `/engines/atomic-prism/builds/${segment(plan.engine.version)}/${segment(plan.engine.backend)}/activate`,
      {}
    )
  }
  const files = pathsOf(paths, plan)
  await enter('downloading_model')
  await download(deps, task_ids.model, plan.model, files.model, signal)
  if (plan.projector && files.projector && task_ids.projector) {
    await enter('downloading_projector')
    await download(deps, task_ids.projector, plan.projector, files.projector, signal)
  }
  await enter('registering')
  const registry = new ModelRegistry(paths.layout)
  await registry.write(plan.model_id, await modelYml(paths, plan, files))
  await enter('verifying')
  const verdict = await link.request<ModelCompatibilityResponse>('POST', '/models/compatibility', {
    model_id: plan.model_id,
    provider: plan.provider,
  })
  if (verdict.outcome !== 'compatible' || (verdict.provider !== null && verdict.provider !== plan.provider)) {
    await registry.remove(plan.model_id)
    throw Object.assign(new Error(verdict.reason), { code: 'MODEL_ENGINE_INCOMPATIBLE' })
  }
}

async function download(
  deps: SetupRunDeps,
  taskId: string,
  artifact: ModelSetupArtifact,
  savePath: string,
  signal: AbortSignal
) {
  if (signal.aborted) throw new SetupCancelled()
  // A file this setup already finished (it failed later) is not fetched again.
  const done = await stat(join(deps.paths.dataFolder, savePath)).catch(() => undefined)
  if (done && artifact.size > 0 && done.size === artifact.size) return
  const token = hfToken(deps.env)
  const item: DownloadItem = {
    url: hfResolveUrl(artifact.repo, artifact.file, artifact.revision),
    save_path: savePath,
    ...(artifact.sha256 ? { sha256: artifact.sha256 } : {}),
    ...(artifact.size > 0 ? { size: artifact.size } : {}),
    ...(deps.proxy ? { proxy: deps.proxy } : {}),
  }
  const abort = () => deps.downloader.cancel(taskId)
  signal.addEventListener('abort', abort, { once: true })
  try {
    await deps.downloader.download(taskId, [item], {
      resume: true,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    })
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

async function modelYml(paths: AtcPaths, plan: ModelSetupPlan, files: { model: string; projector?: string }) {
  const size = async (rel: string) => (await stat(join(paths.layout.root, rel))).size
  const modelSize = await size(files.model)
  const projectorSize = files.projector ? await size(files.projector) : 0
  const { verdict } = plan
  return {
    model_path: files.model,
    ...(files.projector ? { mmproj_path: files.projector } : {}),
    name: (plan.model.file.split('/').pop() ?? plan.model.file).replace(/\.gguf$/i, ''),
    size_bytes: modelSize + projectorSize,
    ...(plan.model.sha256 ? { model_sha256: plan.model.sha256 } : {}),
    model_size_bytes: modelSize,
    ...(plan.projector?.sha256 ? { mmproj_sha256: plan.projector.sha256 } : {}),
    ...(files.projector ? { mmproj_size_bytes: projectorSize, projector_vision: true } : {}),
    embedding: false,
    ...(plan.provider === 'atomic-prism'
      ? {
          atomic_runtime: {
            provider: 'atomic-prism',
            requires: verdict.requires,
            ...(verdict.min_prism_build !== undefined ? { min_build: verdict.min_prism_build } : {}),
            ...(verdict.family ? { family: verdict.family } : {}),
          },
        }
      : {}),
  }
}
