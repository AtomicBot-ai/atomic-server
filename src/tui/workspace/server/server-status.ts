import type { WorkspaceState } from '../state.js'
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
  const engine = active
    ? (s.engines.find((choice) => choice.provider === active.provider)?.id ?? active.provider)
    : s.engine
  return { engine, model: serverChatModel(s) }
}
