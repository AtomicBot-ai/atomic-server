import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CoreLink } from '../core-link/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import { engineFamily, engineName, orderEngines } from '../workspace-view/index.js'
import type { BackendCatalogResponse } from './types.js'
import type { DownloadProgress } from '@atomic-chat/core/contracts'
import { watchEngineDownload } from './engine-progress.js'

export interface EngineChoice {
  id: string
  provider: string
  version: string
  backend: string
  installed: boolean
}
export { engineName }
export function modelProvider(engine: string, provider: string): string {
  const selected = engine.split('|')[0]
  return ['llamacpp-upstream', 'llamacpp'].includes(provider) &&
    ['llamacpp-upstream', 'llamacpp'].includes(selected ?? '')
    ? selected!
    : provider
}
/** Engine preference is independent of an installation's durable progress record. */
export class EngineSelection {
  private path: string
  constructor(
    directory: string,
    private attach: () => Promise<CoreLink>
  ) {
    this.path = join(directory, 'engine-choice.json')
  }
  async read(): Promise<string> {
    const saved = await readDocument<{ id: string } | null>(this.path, null)
    return saved?.id ?? ''
  }
  remember(id: string): Promise<void> {
    return writeDocument(this.path, { id })
  }
  /**
   * Per llama.cpp engine: the builds on disk plus the one the core would install (`latest`), if any;
   * then every other chat engine the core has installed here (a managed engine, Foundry Local).
   */
  async list(catalogs: BackendCatalogResponse[]): Promise<EngineChoice[]> {
    const link = await this.attach()
    const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
    const installed = orderEngines(
      engines
        .filter((e) => ['managed', 'foundry'].includes(engineFamily(e.engine)) && e.active)
        .map((e) => e.engine as string)
    ).map((engine) => {
      const active = engines.find((e) => e.engine === engine)!.active!
      return {
        id: engine,
        provider: engine,
        version: active.version,
        backend: active.variant,
        installed: true,
      }
    })
    const builds = (
      await Promise.all(
        catalogs.map(async (catalog) => {
          const { backends } = await link.request<{ backends: { version: string; backend: string }[] }>(
            'GET',
            `/backends/${catalog.provider}`
          )
          const latest = engines.find((e) => e.engine === catalog.provider)?.latest
          const builds = [
            ...backends,
            ...(latest ? [{ version: latest.version, backend: latest.variant }] : []),
          ]
          return builds
            .filter(
              (b, i) => builds.findIndex((v) => v.version === b.version && v.backend === b.backend) === i
            )
            .map((b) => ({
              id: `${catalog.provider}|${b.version}|${b.backend}`,
              provider: catalog.provider,
              version: b.version,
              backend: b.backend,
              installed: backends.some((v) => v.version === b.version && v.backend === b.backend),
            }))
        })
      )
    ).flat()
    return [...builds, ...installed]
  }
  /** The core installs and activates: `version_backend` in the load queue's turn, old sessions unloaded. */
  async select(
    choice: EngineChoice,
    onProgress?: (progress: DownloadProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    // A managed engine or Foundry Local runs its one active build: choosing it only names the provider.
    if (ENGINE_KINDS[choice.provider as EngineId] !== 'llamacpp') return this.remember(choice.id)
    const link = await this.attach()
    if (choice.installed) await activateEngine(link, choice)
    else {
      const taskId = `terminal-engine-${randomUUID()}`
      const stop = onProgress ? watchEngineDownload(link, taskId, onProgress, signal) : () => {}
      try {
        await link.request('POST', `/engines/${choice.provider}/update`, {
          task_id: taskId,
          target: { version: choice.version, variant: choice.backend },
        })
      } finally {
        stop()
      }
    }
    await this.remember(choice.id)
  }
}

/** Make an installed build the one the next load runs, through the core. */
export function activateEngine(
  link: CoreLink,
  build: { provider: string; version: string; backend: string }
) {
  const segment = encodeURIComponent
  return link.request(
    'POST',
    `/engines/${segment(build.provider)}/builds/${segment(build.version)}/${segment(build.backend)}/activate`
  )
}
