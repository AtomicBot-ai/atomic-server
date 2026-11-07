import type { BackendCatalogResponse } from '../../../terminal-setup/index.js'
import { engineFamily } from '../../../workspace-view/index.js'

/** Build selection belongs to llama.cpp; other engines route models by provider alone. */
export function setupEngineChoice(choice: string, catalogs: BackendCatalogResponse[]): string {
  const provider = choice.split('|')[0] ?? ''
  if (choice) return engineFamily(provider) === 'llamacpp' ? choice : provider
  const first =
    catalogs.find((cat) => cat.provider === 'llamacpp-upstream' && cat.available.length) ??
    catalogs.find((cat) => cat.available.length)
  const build =
    first?.available.find((b) => `${b.version}/${b.backend}` === first.recommended) ?? first?.available[0]
  return first && build ? `${first.provider}|${build.version}|${build.backend}` : ''
}
