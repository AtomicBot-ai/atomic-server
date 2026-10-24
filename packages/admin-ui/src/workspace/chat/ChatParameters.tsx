import { useState } from 'react'
import { SlidersHorizontal, PanelRightClose } from 'lucide-react'
import { useDialog } from '../useDialog'
import { Action, Field } from '../Controls'
import { record } from '../types'
import type { RecordValue } from '../types'
import { ChatCapabilities } from './ChatCapabilities'
import type { ChatPreferences } from './chat-preferences'
import './chat-parameters.css'
const common = [
  ['temperature', 'Temperature', 0, 2, 0.1],
  ['max_tokens', 'Maximum output tokens', 1, undefined, 1],
  ['top_p', 'Top P', 0, 1, 0.05],
  ['presence_penalty', 'Presence penalty', -2, 2, 0.1],
  ['frequency_penalty', 'Frequency penalty', -2, 2, 0.1],
  ['seed', 'Seed', 0, undefined, 1],
] as const
export function ChatParameters({
  system,
  setSystem,
  parameters,
  setParameters,
  preferences,
  save,
  disabled,
  provider,
  capabilities = {},
  usage = {},
}: {
  system: string
  setSystem: (v: string) => void
  parameters: string
  setParameters: (v: string) => void
  preferences: ChatPreferences
  save: (v: ChatPreferences) => void
  disabled: boolean
  provider: string
  capabilities?: RecordValue
  usage?: RecordValue
}) {
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false)
  const dialog = useDialog(() => setOpen(false), open)
  let values: Record<string, unknown> = {}
  try {
    values = record(JSON.parse(parameters))
  } catch {
    /* The raw editor keeps invalid drafts editable. */
  }
  const update = (key: string, value: unknown) => {
    const next = { ...values }
    if (value === '') delete next[key]
    else next[key] = value
    setParameters(JSON.stringify(next, null, 2))
  }
  const matchingPreset = preferences.presets.findIndex(
    (preset) => preset.system === system && preset.parameters === parameters
  )
  return (
    <>
      <button
        className="chat-parameters-trigger"
        aria-label="Request parameters"
        title="Request parameters"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={18} />
      </button>
      {open && (
        <div className="chat-parameters-backdrop">
          <section
            ref={dialog}
            className="chat-parameters"
            role="dialog"
            aria-modal="true"
            aria-label="Run settings"
            tabIndex={-1}
          >
            <div className="chat-parameters-heading">
              <h2>Run settings</h2>
              <button
                aria-label="Close run settings"
                title="Close run settings"
                onClick={() => setOpen(false)}
              >
                <PanelRightClose size={18} />
              </button>
            </div>
            <p className="ew-muted">{provider || 'Choose a model'} · Blank fields use engine defaults.</p>
            <ChatCapabilities usage={usage} capabilities={capabilities} />
            <fieldset disabled={disabled}>
              <Field label="System prompt">
                <textarea value={system} onChange={(e) => setSystem(e.target.value)} />
              </Field>
              <details open>
                <summary>Sampling & output</summary>
                <div className="form-grid">
                  {common.map(([key, label, min, max, step]) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        placeholder="Engine default"
                        value={String(values[key] ?? '')}
                        onChange={(e) => update(key, e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </Field>
                  ))}
                </div>
              </details>
              <details>
                <summary>Additional engine parameters & tools</summary>
                <Field
                  label="Request JSON"
                  hint="Tools, response_format, reasoning and engine-specific samplers. Fields are sent only when explicitly set. Model, messages and streaming are managed by the Playground."
                >
                  <textarea
                    className="code-input"
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                  />
                </Field>
                <Action
                  onClick={() =>
                    update('tools', [
                      {
                        type: 'function',
                        function: {
                          name: 'get_datetime',
                          description: 'Get the current date and time from the browser after user approval.',
                          parameters: { type: 'object', properties: {}, additionalProperties: false },
                        },
                      },
                    ])
                  }
                >
                  Add current-time tool example
                </Action>
                <p className="ew-muted">
                  Tool calls pause for your result or denial. The Playground does not execute shell commands
                  or model-generated JavaScript. Use Connect for your agent’s MCP and tool execution.
                </p>
              </details>
              <details>
                <summary>Saved presets</summary>
                <Field label="Apply preset">
                  <select
                    value={matchingPreset < 0 ? '' : matchingPreset}
                    onChange={(e) => {
                      const preset = preferences.presets[Number(e.target.value)]
                      if (preset) {
                        setSystem(preset.system)
                        setParameters(preset.parameters)
                      }
                    }}
                  >
                    <option value="">Choose a preset</option>
                    {preferences.presets.map((p, i) => (
                      <option key={p.name} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Preset name">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Action
                  disabled={!name.trim()}
                  onClick={() => {
                    try {
                      const value = JSON.parse(parameters)
                      if (!value || typeof value !== 'object' || Array.isArray(value))
                        throw new Error('Request JSON must be an object.')
                      save({
                        ...preferences,
                        presets: [
                          ...preferences.presets.filter((p) => p.name !== name.trim()),
                          { name: name.trim(), system, parameters },
                        ],
                      })
                      setName('')
                      setError('')
                    } catch (e) {
                      setError(String(e))
                    }
                  }}
                >
                  Save preset
                </Action>
                <Action
                  onClick={() => {
                    save({ ...preferences, system, parameters })
                    setError('')
                  }}
                >
                  Use for new conversations
                </Action>
              </details>
              {error && (
                <p role="alert" className="ew-error">
                  {error}
                </p>
              )}
            </fieldset>
          </section>
        </div>
      )}
    </>
  )
}
