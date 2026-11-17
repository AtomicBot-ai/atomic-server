import { connectionModelProviders, connectionModelState } from '../../../workspace-view/index.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'

export async function readConnectionEngines(controller: WorkspaceController): Promise<string[] | null> {
  try {
    return await controller.setup.installed()
  } catch {
    return null
  }
}

export function connectionModels(s: WorkspaceState, provider = '') {
  const active = s.connectionEngines ?? []
  return s.installed.filter((model) =>
    connectionModelProviders(model).some((id) => active.includes(id) && (!provider || provider === id))
  )
}

/** The provider written in the draft must remain the provider sent to Configure & start. */
export function connectionSelection(
  s: WorkspaceState,
  model = s.connection?.model ?? '',
  provider = s.connection?.provider ?? '',
  strict = true
) {
  const active = s.connectionEngines ?? []
  return connectionModelState(
    model,
    s.installed,
    s.workspace?.setups ?? [],
    s.workspace?.downloads ?? [],
    provider,
    strict && provider ? active.filter((id) => id === provider) : active
  )
}
