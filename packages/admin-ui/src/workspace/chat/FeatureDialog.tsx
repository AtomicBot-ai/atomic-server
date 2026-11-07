import { Bot, Blocks, Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { WorkspaceFeatures } from '@contract'
import type { ChatFeatureSelection } from './ChatFeaturePicker'
import { useDialog } from '../useDialog'
import { DetailPicker } from '../server/DetailPicker'
import './chat-feature-dialog.css'

export function FeatureDialog({
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
  // The button sits in the composer, whose dark ink would otherwise colour this dark dialog's text.
  return createPortal(
    <div className="modal-shade">
      <section
        ref={dialog}
        className="ew-modal chat-feature-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant and tools"
        tabIndex={-1}
      >
        <header className="chat-tools-heading">
          <div>
            <h2>Assistant and tools</h2>
            <p>Choose what this conversation can use.</p>
          </div>
          <button onClick={onClose} aria-label="Close assistant and tools">
            <X size={18} />
          </button>
        </header>
        <div className="chat-tools-body">
          <section className="chat-tools-section">
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
            <p className="chat-tools-hint">Sets the instructions and style for this conversation.</p>
          </section>
          <section className="chat-tools-section">
            <h3>
              <Sparkles size={16} /> Skills
            </h3>
            {features.skills
              .filter((s) => s.enabled)
              .map((s) => (
                <label className="chat-tool-choice" key={s.name}>
                  <input
                    type="checkbox"
                    checked={value.skills.includes(s.name)}
                    onChange={() => toggle('skills', s.name)}
                  />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.description}</small>
                  </span>
                </label>
              ))}
            {!features.skills.some((s) => s.enabled) && (
              <p className="chat-tools-empty">No enabled skills. Manage them in Settings → Skills.</p>
            )}
          </section>
          <section className="chat-tools-section">
            <h3>
              <Blocks size={16} /> MCP connectors
            </h3>
            {features.connectors.map((c) => (
              <label
                className="chat-tool-choice"
                data-unavailable={!c.enabled || features.connector_status[c.id]?.state !== 'connected'}
                key={c.id}
              >
                <input
                  type="checkbox"
                  checked={value.connectors.includes(c.id)}
                  disabled={!c.enabled || features.connector_status[c.id]?.state !== 'connected'}
                  onChange={() => toggle('connectors', c.id)}
                />
                <span>
                  <strong>{c.name}</strong>
                  <small>{features.connector_status[c.id]?.state ?? 'disconnected'}</small>
                </span>
              </label>
            ))}
            {!features.connectors.length && (
              <p className="chat-tools-empty">
                No connectors configured. Add one in Settings → MCP connectors.
              </p>
            )}
          </section>
        </div>
        <footer className="chat-tools-footer">
          <span>Changes apply to your next message.</span>
          <button className="ew-button primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>,
    document.querySelector('.desktop-workspace') ?? document.body
  )
}
