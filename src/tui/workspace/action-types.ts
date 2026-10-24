import type { AgentLaunch } from '../../agent-launch/index.js'
import type { WorkspaceController } from './controller.js'
import type { WorkspaceState } from './state.js'
export interface ActionContext {
  handoff?: (launch: AgentLaunch) => void
  get: () => WorkspaceState
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
  controller: WorkspaceController
  send: () => void
  copy: (text: string) => void
  cancel: () => void
}
