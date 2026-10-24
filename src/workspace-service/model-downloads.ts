import type { EngineDownloads } from './engine-downloads.js'
import { join } from 'node:path'
import { Downloader } from '../downloads/index.js'
import { captureReport, downloadFailureReport } from '../telemetry/index.js'
import { ManagedModelSetups } from './managed-model-setups.js'
import { FoundryModelSetups } from './foundry-model-setups.js'
import { ArtifactService } from './artifacts.js'
import type { WorkspaceCatalog } from './catalog.js'
import { downloadProxy } from './download-proxy.js'
import { ModelSetups } from './model-setups.js'
import type { WorkspaceServiceOptions } from './service.js'

/** One downloader for every model this server fetches: GGUF setups, media, MLX and the managed store. */
export function modelDownloads(
  options: WorkspaceServiceOptions,
  catalog: WorkspaceCatalog,
  request: typeof fetch,
  engines?: EngineDownloads
) {
  const downloader = new Downloader({
    dataFolder: options.paths.dataFolder,
    platform: options.platform ?? process.platform,
    fetch: request,
    availableSpace: async (path) => (await options.link.disk.available(path)) ?? undefined,
    onFailure: (error) => captureReport(options.errors, downloadFailureReport(error)),
  })
  return {
    downloader,
    artifacts: new ArtifactService(options, catalog, request, downloader, engines?.ensure.bind(engines)),
    managed: new ManagedModelSetups({
      link: options.link,
      fetch: request,
      env: options.env,
      directory: join(options.paths.atcDir, 'managed-model-setups'),
      downloader,
      proxy: downloadProxy(options.config),
    }),
    foundry: new FoundryModelSetups({
      link: options.link,
      fetch: request,
      list: {
        cachePath: join(options.paths.atcDir, 'cache', 'foundry-local-models.json'),
        url: options.env?.['ATC_FOUNDRY_LOCAL_MODELS_URL'],
      },
      platform: options.platform ?? process.platform,
      arch: process.arch,
      modelsDir: options.paths.layout.provider('foundry-local').modelsDir,
      directory: join(options.paths.atcDir, 'foundry-model-setups'),
      downloader,
      proxy: downloadProxy(options.config),
    }),
    setups: new ModelSetups({
      ...(engines
        ? {
            installEngine: (engine, taskId) =>
              engines.ensure('atomic-prism', taskId, { version: engine.version, variant: engine.backend }),
          }
        : {}),
      link: options.link,
      paths: options.paths,
      downloader,
      fetch: request,
      env: options.env ?? {},
      proxy: downloadProxy(options.config),
    }),
  }
}
