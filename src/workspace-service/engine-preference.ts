/** Shared engine preference for Web and TUI; the core remains the build authority. */
import type { EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { WorkspaceInput } from '../contract/index.js'
import type { CoreLink } from '../core-link/index.js'
import { EngineSelection } from '../terminal-setup/index.js'
import { AtcError } from '../errors/index.js'
import { NOT_CORE } from './not-core.js'

export async function enginePreferenceOperation(
  link: CoreLink,
  directory: string,
  operation: string,
  input: WorkspaceInput
) {
  if (operation !== 'engines.selected' && operation !== 'engines.select') return NOT_CORE
  const selection = new EngineSelection(directory, async () => link)
  if (operation === 'engines.selected') {
    const id = await selection.read()
    return { id, engine: id.split('|')[0] ?? '' }
  }
  const engine = String(input['engine'])
  const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
  const entry = engines.find((candidate) => candidate.engine === engine)
  if (!entry?.active) throw new AtcError('ATC_USAGE', 'Install this engine before selecting it.')
  const id = `${engine}|${entry.active.version}|${entry.active.variant}`
  await selection.remember(id)
  return { id, engine }
}
