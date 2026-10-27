import type { WorkspaceState } from '../state.js'
import { serverPanelSelection } from '../../../workspace-view/index.js'
export function serverRunning(s: WorkspaceState) {
  return s.workspace?.api?.running ?? (s.base.daemon.kind === 'up' && s.base.daemon.snapshot.server.running)
}
export function serverChatModel(s: WorkspaceState) {
  return s.workspace
    ? (s.workspace.services?.find((service) => service.kind === 'chat')?.model ?? '')
    : s.model
}

/** The saved selection follows the running service; only an explicit draft overrides it. */
export function serverSelection(s: WorkspaceState) {
  if (s.serverDraft) return s.serverDraft
  const active = s.workspace?.services?.find((service) => service.kind === 'chat')
  if (active)
    return {
      engine: s.engines.find((choice) => choice.provider === active.provider)?.id ?? active.provider,
      model: serverChatModel(s),
    }
  // Nothing loaded: the saved engine and the last download, as the web admin's panel shows them.
  const shared = serverPanelSelection(s.workspace, s.engine)
  return { engine: shared.engine, model: serverChatModel(s) || shared.model }
}
