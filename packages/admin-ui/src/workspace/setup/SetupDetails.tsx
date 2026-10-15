import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Field } from '../Controls'
import { RuntimeSettings } from '../server/RuntimeSettings'
import { EngineSettings } from '../library/EngineSettings'
import { OperationForm } from '../OperationForm'
import { record, text } from '../types'
import { describeError } from '@/services/admin-api'

export function SetupDetails({
  workspace,
  engine = '',
  expanded = false,
  onConfigSaved,
}: {
  workspace: Workspace
  engine?: string
  expanded?: boolean
  onConfigSaved?: () => void
}) {
  const [open, setOpen] = useState(expanded)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="setup-details">
      <summary>
        {expanded ? 'Command setup & additional details' : 'Additional details: commands & configuration'}
      </summary>
      {open && <DetailsContent workspace={workspace} engine={engine} onConfigSaved={onConfigSaved} />}
    </details>
  )
}
function DetailsContent({
  workspace: w,
  engine,
  onConfigSaved,
}: {
  workspace: Workspace
  engine: string
  onConfigSaved?: () => void
}) {
  const [prefix, setPrefix] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(false)
  const [provider, setProvider] = useState(engine || 'llamacpp-upstream')
  const [engineSettings, setEngineSettings] = useState(false)
  const [operation, setOperation] = useState('')
  const { execute } = w
  useEffect(() => {
    let active = true
    void execute('config.get')
      .then((value) => {
        if (active) setPrefix(text(record(value).command_prefix, ''))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
    return () => {
      active = false
    }
  }, [execute])
  useEffect(() => {
    if (engine) setProvider(engine)
  }, [engine])
  const commands = [
    ['1. Inspect this server', 'status --json'],
    ['2. Choose an engine before a model', 'control call engines.list --json'],
    ['3. Inspect the model catalog', 'control call models.catalog --input \'{"category":"text"}\' --json'],
    ['Inspect available configuration', 'config list --json'],
    ['Inspect engine settings', `control call settings.get --input '${JSON.stringify({ provider })}' --json`],
    ['Discover every operation and input', 'control list --json'],
  ]
  const selected = w.operations.find((item) => item.name === operation)
  return (
    <>
      <p className="ew-muted">
        Use commands in your terminal, or use the forms below. Choose an engine and model in this wizard to
        get exact review, install and run commands. All commands target this server profile.
      </p>
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
      {prefix && (
        <details>
          <summary>Setup commands</summary>
          {commands.map(([label, suffix]) => (
            <div className="request-example" key={label}>
              <strong>{label}</strong>
              <pre>{`${prefix} ${suffix}`}</pre>
              <Copy value={`${prefix} ${suffix}`} label={`Copy: ${label}`} />
            </div>
          ))}
          <p className="ew-muted">
            After loading a model: use api start, control call api.ping --json, and connect &lt;agent&gt;. Run
            each with the same executable and --data-folder shown above. Engine/model changes apply on the
            next load; listener changes require applying or restarting the API.
          </p>
        </details>
      )}
      <details open={settings} onToggle={(e) => setSettings(e.currentTarget.open)}>
        <summary>Server settings: ports, access, proxy, storage profile & logging</summary>
        {settings && (
          <>
            <p className="ew-muted">
              The data folder is selected when launching the server with --data-folder. Settings below are
              saved to this profile. Save before continuing setup.
            </p>
            <RuntimeSettings workspace={w} onSaved={onConfigSaved} />
          </>
        )}
      </details>
      <details>
        <summary>Engine settings: context, memory & performance</summary>
        <Field label="Settings engine">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {['llamacpp-upstream', 'llamacpp', 'atomic-prism', 'mlx', 'vllm', 'tensorrt-llm'].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </Field>
        <Action onClick={() => setEngineSettings(true)}>Configure engine</Action>
      </details>
      <details>
        <summary>All operations: advanced inputs & managed runtimes</summary>
        <Field label="Advanced operation">
          <select value={operation} onChange={(e) => setOperation(e.target.value)}>
            <option value="">Choose an operation</option>
            {w.operations.map((item) => (
              <option key={item.name} value={item.name}>
                {item.title} · {item.name}
              </option>
            ))}
          </select>
        </Field>
        {selected && (
          <OperationForm key={operation} operation={selected} execute={execute} commandPrefix={prefix} />
        )}
      </details>
      {engineSettings && (
        <EngineSettings provider={provider} workspace={w} onClose={() => setEngineSettings(false)} />
      )}
    </>
  )
}
