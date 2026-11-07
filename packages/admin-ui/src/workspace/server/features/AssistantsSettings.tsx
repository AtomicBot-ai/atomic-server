// Lifted from atomic-chat-ui/web-app/src/routes/settings/assistant.tsx @ 807b4d9; adapted: extracted assistant defaults and profile list.
import { useState } from 'react'
import { Bot, Plus, Pencil, Trash2 } from 'lucide-react'
import { DEFAULT_ASSISTANT } from '@contract'
import { describeError } from '@/services/admin-api'
import { Action } from '../../Controls'
import { ActionConfirmation } from '../../ActionConfirmation'
import { StatusIndicator } from '../../StatusIndicator'
import { DetailPicker } from '../DetailPicker'
import type { Workspace } from '../../useWorkspace'
import { FeatureEditor } from './FeatureEditor'
import './assistants-settings.css'

/** Assistant defaults and saved profiles share one compact, readable settings page. */
export function AssistantsSettings({ workspace: w }: { workspace: Workspace }) {
  const [editor, setEditor] = useState<Record<string, unknown> | null>(null)
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const assistants = w.snapshot?.features?.assistants ?? [DEFAULT_ASSISTANT]
  const defaultId = w.snapshot?.features?.default_assistant ?? DEFAULT_ASSISTANT.id
  return (
    <section className="assistants-settings" aria-label="Assistant settings">
      <header className="assistants-heading">
        <div>
          <h1>Assistants</h1>
          <p>Save instructions and defaults for your conversations.</p>
        </div>
        <Action primary onClick={() => setEditor({ avatar: '*', parameters: {} })}>
          <Plus size={16} />
          Add assistant
        </Action>
      </header>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      <section className="assistant-default-section" aria-label="Default assistant">
        <div>
          <h2>Default assistant</h2>
          <p>Used when a conversation follows the default.</p>
        </div>
        <DetailPicker
          label="Default assistant"
          value={defaultId}
          placeholder="Choose assistant"
          disabled={busy}
          choices={assistants.map((a) => ({ id: a.id, name: a.name, icon: null }))}
          onChange={async (id) => {
            setBusy(true)
            setError('')
            try {
              await w.execute('assistants.default', { id })
            } catch (failure) {
              setError(describeError(failure))
            } finally {
              setBusy(false)
            }
          }}
        />
      </section>
      <section className="assistant-list" aria-label="Saved assistants">
        <div className="assistant-list-heading">
          <h2>Saved assistants</h2>
          <span>{assistants.length}</span>
        </div>
        {!assistants.length && (
          <p className="assistant-list-empty">
            No saved assistants. Add one to reuse its instructions in chat.
          </p>
        )}
        {assistants.map((a) => (
          <article className="assistant-item" key={a.id} aria-label={a.name}>
            <span className="assistant-avatar" aria-hidden="true">
              {a.avatar || <Bot size={20} />}
            </span>
            <div className="assistant-copy">
              <div className="assistant-name">
                <h3>{a.name}</h3>
                {a.id === defaultId && <StatusIndicator>Default</StatusIndicator>}
              </div>
              <p>
                {a.description ||
                  (a.id === DEFAULT_ASSISTANT.id
                    ? 'Built-in assistant. Customize its instructions to suit you.'
                    : 'Custom instructions for your conversations.')}
              </p>
            </div>
            <div className="assistant-actions">
              <Action onClick={() => setEditor({ ...a })}>
                <Pencil size={15} />
                Edit
              </Action>
              {a.id !== DEFAULT_ASSISTANT.id && (
                <Action ariaLabel={`Delete ${a.name}`} onClick={() => setRemove(a)}>
                  <Trash2 size={15} />
                  Delete
                </Action>
              )}
            </div>
          </article>
        ))}
      </section>
      {editor && (
        <FeatureEditor kind="assistants" initial={editor} workspace={w} close={() => setEditor(null)} />
      )}
      {remove && (
        <ActionConfirmation
          title={`Delete ${remove.name}?`}
          actionLabel="Delete"
          danger
          onClose={() => setRemove(null)}
          onConfirm={() => w.execute('assistants.remove', { id: remove.id })}
        />
      )}
    </section>
  )
}
