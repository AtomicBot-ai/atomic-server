import { useId } from 'react'
import type { ReactNode } from 'react'
import { Action } from './Controls'
import './settings-form.css'
export { SettingsField } from './SettingsField'

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="settings-section" aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-section-fields">{children}</div>
    </section>
  )
}

export function SettingsActions({
  saving = false,
  valid = true,
  message = 'Unsaved changes',
  onDiscard,
  onSave,
}: {
  saving?: boolean
  valid?: boolean
  message?: string
  onDiscard: () => void
  onSave: () => void | Promise<unknown>
}) {
  return (
    <div className="settings-actions-bar">
      <span role="status">{saving ? 'Saving changes…' : message}</span>
      <div className="settings-actions-buttons">
        <Action disabled={saving} onClick={onDiscard}>
          Discard
        </Action>
        <Action primary disabled={saving || !valid} onClick={onSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </Action>
      </div>
    </div>
  )
}
