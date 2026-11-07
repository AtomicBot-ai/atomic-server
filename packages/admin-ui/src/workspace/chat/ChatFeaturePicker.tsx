import { Puzzle } from 'lucide-react'
import { useState } from 'react'
import type { WorkspaceFeatures } from '@contract'
import { FeatureDialog } from './FeatureDialog'

export interface ChatFeatureSelection {
  assistant: string
  skills: string[]
  connectors: string[]
}
export function ChatFeaturePicker({
  features,
  value,
  onChange,
  disabled,
}: {
  features?: WorkspaceFeatures
  value: ChatFeatureSelection
  onChange: (value: ChatFeatureSelection) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!features) return null
  return (
    <div className="chat-feature-control">
      <button
        aria-label="Assistant and tools"
        title="Assistant and tools"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Puzzle size={17} />
        <span>Tools</span>
      </button>
      {open && (
        <FeatureDialog features={features} value={value} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
