import { Bot, Blocks, Sparkles, Puzzle } from 'lucide-react'
import { useState } from 'react'
import type { WorkspaceFeatures } from '@contract'
import { useDialog } from '../useDialog'
import { DetailPicker } from '../server/DetailPicker'

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
function FeatureDialog({
  features,
  value,
  onChange,
  onClose,
}: {
  features: WorkspaceFeatures
  value: ChatFeatureSelection
  onChange: (value: ChatFeatureSelection) => void
  onClose: () => void
}) {
  const dialog = useDialog(onClose)
  const toggle = (field: 'skills' | 'connectors', id: string) =>
    onChange({
      ...value,
      [field]: value[field].includes(id) ? value[field].filter((v) => v !== id) : [...value[field], id],
    })
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        className="ew-modal chat-feature-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant and tools"
        tabIndex={-1}
      >
        <div className="panel-heading">
          <h2>Assistant and tools</h2>
          <button onClick={onClose} aria-label="Close assistant and tools">
            ×
          </button>
        </div>
        <DetailPicker
          label="Assistant"
          value={value.assistant}
          placeholder="Default assistant"
          onChange={(assistant) => onChange({ ...value, assistant })}
          choices={[
            { id: '', name: 'Default assistant', icon: <Bot size={16} /> },
            ...features.assistants.map((a) => ({
              id: a.id,
              name: a.name,
              detail: a.description,
              icon: <Bot size={16} />,
            })),
            { id: 'none', name: 'No assistant', icon: <Bot size={16} /> },
          ]}
        />
        <h3>
          <Sparkles size={16} /> Skills
        </h3>
        {features.skills
          .filter((s) => s.enabled)
          .map((s) => (
            <label key={s.name}>
              <input
                type="checkbox"
                checked={value.skills.includes(s.name)}
                onChange={() => toggle('skills', s.name)}
              />
              <span>
                {s.name}
                <small>{s.description}</small>
              </span>
            </label>
          ))}
        {!features.skills.some((s) => s.enabled) && <p>No enabled skills. Add skills in Settings.</p>}
        <h3>
          <Blocks size={16} /> MCP connectors
        </h3>
        {features.connectors.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={value.connectors.includes(c.id)}
              disabled={!c.enabled || features.connector_status[c.id]?.state !== 'connected'}
              onChange={() => toggle('connectors', c.id)}
            />
            <span>
              {c.name}
              <small>{features.connector_status[c.id]?.state ?? 'disconnected'}</small>
            </span>
          </label>
        ))}
        {!features.connectors.length && <p>No connectors. Add connectors in Settings.</p>}
        <button className="ew-button primary" onClick={onClose}>
          Done
        </button>
      </section>
    </div>
  )
}
