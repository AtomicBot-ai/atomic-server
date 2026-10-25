import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { describeError } from '@/services/admin-api'
import { Field } from '../Controls'
import { useDialog } from '../useDialog'

export function RenameConversationDialog({
  title,
  onSave,
  onClose,
}: {
  title: string
  onSave: (title: string) => Promise<unknown>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(title)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const close = () => {
    if (!locked.current) onClose()
  }
  const ref = useDialog(close)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return createPortal(
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal"
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-modal="true"
        aria-label="Rename conversation"
        aria-busy={pending || undefined}
        tabIndex={-1}
      >
        <h2>Rename conversation</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (locked.current || !draft.trim()) return
            locked.current = true
            setPending(true)
            setError('')
            try {
              await onSave(draft.trim().slice(0, 200))
              onClose()
            } catch (e) {
              setError(describeError(e))
            } finally {
              locked.current = false
              setPending(false)
            }
          }}
        >
          <Field label="Conversation title">
            <input
              ref={input}
              value={draft}
              maxLength={200}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          {error && (
            <p className="ew-error" role="alert">
              {error}
            </p>
          )}
          <div className="ew-actions">
            <button className="ew-button" type="button" disabled={pending} onClick={close}>
              Cancel
            </button>
            <button className="ew-button primary" type="submit" disabled={pending || !draft.trim()}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.querySelector('.desktop-workspace') ?? document.body
  )
}
