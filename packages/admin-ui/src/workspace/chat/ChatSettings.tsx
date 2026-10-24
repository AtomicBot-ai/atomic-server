import { createPortal } from 'react-dom'
import { useState } from 'react'
import { useDialog } from '../useDialog'
import { Action, Field } from '../Controls'
import { CHAT_DEFAULTS, downloadJson, validPreferences } from './chat-preferences'
import type { ChatPreferences } from './chat-preferences'
const checks = [
  ['sendOnEnter', 'Enter sends; Shift+Enter adds a line'],
  ['autoScroll', 'Follow the response while generating'],
  ['markdown', 'Render Markdown'],
  ['showStats', 'Show response statistics'],
  ['showSystem', 'Show system message'],
  ['rawNames', 'Show full model IDs'],
  ['sidebar', 'Show conversation sidebar'],
] as const
export function ChatSettings({
  value,
  save,
  onClose,
}: {
  value: ChatPreferences
  save: (v: ChatPreferences) => void
  onClose: () => void
}) {
  const ref = useDialog(onClose),
    [draft, set] = useState(value),
    [section, setSection] = useState('General'),
    [error, setError] = useState('')
  return createPortal(
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Playground preferences"
      >
        <div className="panel-heading">
          <h2>Playground preferences</h2>
          <button className="ew-button" onClick={onClose}>
            Close
          </button>
        </div>
        <nav className="subnav" aria-label="Preference sections">
          {['General', 'Display', 'Import / export'].map((name) => (
            <button key={name} className={section === name ? 'active' : ''} onClick={() => setSection(name)}>
              {name}
            </button>
          ))}
        </nav>
        {section !== 'Import / export' && (
          <>
            {checks
              .filter(([key]) => (section === 'General' ? key === 'sendOnEnter' : key !== 'sendOnEnter'))
              .map(([key, title]) => (
                <label key={key} className="preference-check">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={(e) => set({ ...draft, [key]: e.target.checked })}
                  />
                  {title}
                </label>
              ))}
            {section === 'General' ? (
              <Field
                label="Default system message"
                hint="Used for new conversations. Existing conversations keep their system message."
              >
                <textarea value={draft.system} onChange={(e) => set({ ...draft, system: e.target.value })} />
              </Field>
            ) : (
              <div className="form-grid">
                <Field label="Playground theme">
                  <select value={draft.theme} onChange={(e) => set({ ...draft, theme: e.target.value })}>
                    {['dark', 'light', 'system'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Message font size">
                  <input
                    type="number"
                    min={12}
                    max={24}
                    value={draft.fontSize}
                    onChange={(e) => set({ ...draft, fontSize: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Maximum code block height">
                  <input
                    type="number"
                    min={100}
                    max={1200}
                    value={draft.codeHeight}
                    onChange={(e) => set({ ...draft, codeHeight: Number(e.target.value) })}
                  />
                </Field>
              </div>
            )}
          </>
        )}
        {section === 'Import / export' && (
          <>
            <Action
              onClick={() =>
                downloadJson('atomic-playground-preferences.json', {
                  format: 'atomic-playground-preferences-v1',
                  preferences: draft,
                })
              }
            >
              Export preferences and presets
            </Action>
            <Field label="Import preferences">
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    if (file.size > 1000000) throw new Error('Choose a file smaller than 1 MB.')
                    const data = JSON.parse(await file.text())
                    if (data.format !== 'atomic-playground-preferences-v1')
                      throw new Error('Choose an Atomic Playground preferences export.')
                    set(validPreferences(data.preferences))
                    setError('')
                  } catch (err) {
                    setError(String(err))
                  }
                }}
              />
            </Field>
            <p className="ew-muted">
              Imported preferences are staged until Save. Server settings and API keys are not included.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        <p className="ew-muted">
          Saved in this browser. These preferences do not change the server or your connected agent.
        </p>
        <div className="ew-actions">
          <Action
            primary
            onClick={() => {
              save(draft)
              onClose()
            }}
          >
            Save preferences
          </Action>
          <Action onClick={() => set({ ...CHAT_DEFAULTS })}>Reset draft to defaults</Action>
        </div>
      </section>
    </div>,
    document.querySelector('.desktop-workspace') ?? document.body
  )
}
