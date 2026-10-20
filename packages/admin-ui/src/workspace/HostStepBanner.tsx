import { Copy } from './Controls'
import type { Workspace } from './useWorkspace'

/**
 * The privileged step a managed engine's setup waits on, when the server could not run it itself: the
 * exact command to run as administrator (the workspace snapshot's `host_steps`). The setup moves on by
 * itself once it ran.
 */
export function HostStepBanner({ workspace: w }: { workspace: Workspace }) {
  const steps = w.snapshot?.host_steps ?? []
  if (!steps.length) return null
  return (
    <div className="host-step-banner" role="status">
      {steps.map((step) => (
        <div key={step.step_id} className="request-example">
          <strong>A managed engine waits for a privileged step. Run this as administrator:</strong>
          <pre>{step.instructions}</pre>
          <Copy value={step.instructions} label="Copy command" />
        </div>
      ))}
    </div>
  )
}
