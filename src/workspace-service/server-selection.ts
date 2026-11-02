/** Persisted server selection is shared by both clients, including models selected earlier in this profile. */
import { readTextFile, resolveConfig } from '../config/index.js'
import { EngineSelection, modelProvider } from '../terminal-setup/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import type { WorkspaceServiceOptions } from './service-options.js'

type Execute = (name: string, input?: WorkspaceInput) => Promise<unknown>

export async function readServerSelection({ link, paths, config }: WorkspaceServiceOptions) {
  // The terminal and CLI can save config directly while the daemon is already running.
  const text = await readTextFile(paths.configFile)
  const values = text ? resolveConfig({ fileText: text, env: {} }).values : config
  const engine = await new EngineSelection(paths.atcDir, async () => link).read()
  return { engine, model: values.tui.model }
}

export async function restoreServerSelection(options: WorkspaceServiceOptions, execute: Execute) {
  const selection = await readServerSelection(options)
  if (!selection.model) return false
  const installed = (await execute('models.installed')) as Array<{ id: string; provider: string }>
  const model = installed.find((m) => m.id === selection.model)
  // Downloads and missing files stay under their existing setup flow.
  if (!model) return false
  const provider = modelProvider(selection.engine, model.provider)
  const loaded = (await options.link.models.sessions()).some(
    (s) => s.model_id === model.id && s.provider === provider
  )
  if (!loaded) await execute('models.load', { provider, model_id: model.id })
  return true
}
