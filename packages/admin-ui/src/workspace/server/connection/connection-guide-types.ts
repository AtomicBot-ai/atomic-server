import type { Workspace } from '../../useWorkspace'

export interface ConnectionGuideProps {
  workspace: Workspace
  preferredModel?: string
  preferredProvider?: string
  initialAgent?: string
  onboarding?: boolean
  onClose: () => void
  onDone?: () => void
  onBack?: () => void
  onSettings?: () => void
  onPrepared?: (agent: string) => void
  /** Keep the local result open while another client observes shared setup completion. */
  onConfigure?: () => void
}
