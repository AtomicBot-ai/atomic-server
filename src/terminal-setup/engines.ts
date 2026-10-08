import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CoreLink } from '../core-link/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import type { BackendCatalogResponse } from './types.js'

export interface EngineChoice {
  id: string
  provider: string
  version: string
  backend: string
  installed: boolean
}
export const engineName = (provider: string): string =>
  ({ 'llamacpp-upstream': 'llama.cpp', 'llamacpp': 'llama.cpp TurboQuant', 'atomic-prism': 'Atomic Prism' })[
    provider
  ] ?? provider
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
  async list(catalogs: BackendCatalogResponse[]): Promise<EngineChoice[]> {
    const link = await this.attach()
    return (
      await Promise.all(
        catalogs.map(async (catalog) => {
          const { backends } = await link.request<{ backends: { version: string; backend: string }[] }>(
            'GET',
            `/backends/${catalog.provider}`
          )
          const recommended =
            catalog.available.find((b) => `${b.version}/${b.backend}` === catalog.recommended) ??
            catalog.available[0]
          const builds = [...backends, ...(recommended ? [recommended] : [])]
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
  }
  async select(choice: EngineChoice): Promise<void> {
    const link = await this.attach()
    if (!choice.installed)
      await link.request('POST', `/backends/${choice.provider}/install`, {
        version: choice.version,
        backend: choice.backend,
        task_id: `terminal-engine-${randomUUID()}`,
      })
    await link.request('PATCH', `/settings/${choice.provider}`, {
      values: { version_backend: `${choice.version}/${choice.backend}` },
    })
    await this.remember(choice.id)
  }
}
