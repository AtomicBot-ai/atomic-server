import { Downloader } from '../downloads/index.js'
import { ArtifactService } from './artifacts.js'
import type { WorkspaceCatalog } from './catalog.js'
import { downloadProxy } from './download-proxy.js'
import { ModelSetups } from './model-setups.js'
import type { WorkspaceServiceOptions } from './service.js'

/** One downloader for every model this server fetches: GGUF setups, media and MLX installs. */
export function modelDownloads(
  options: WorkspaceServiceOptions,
  catalog: WorkspaceCatalog,
  request: typeof fetch
) {
  const downloader = new Downloader({
    dataFolder: options.paths.dataFolder,
    platform: options.platform ?? process.platform,
    fetch: request,
    availableSpace: async (path) => (await options.link.disk.available(path)) ?? undefined,
  })
  return {
    downloader,
    artifacts: new ArtifactService(options, catalog, request, downloader),
    setups: new ModelSetups({
      link: options.link,
      paths: options.paths,
      downloader,
      fetch: request,
      env: options.env ?? {},
      proxy: downloadProxy(options.config),
    }),
  }
}
