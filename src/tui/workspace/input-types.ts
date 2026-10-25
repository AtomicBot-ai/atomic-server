import type { WorkspaceState } from './state.js'
export interface InputResult {
  patch?: Partial<WorkspaceState>
  action?: string | undefined
  quit?: true
  leader?: boolean
}
