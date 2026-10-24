// Lifted from Atomic-Chat/web-app/src/containers/Card.tsx @ 5043013; adapted: accessible controls from the server configuration schema.
import { useId } from 'react'
import { SETTING_LABELS } from '@contract'
import { engineName } from '@view'
import { text } from '../types'
import type { RecordValue } from '../types'
import { runtimeSettingError } from './runtime-setting-error'

const hints: Record<string, string> = {
  'admin.autoStart': 'Serve the web interface when the server starts.',
  'admin.openOnStart': 'Open this interface in your browser when starting the server.',
  'engines.autoInstall': 'Install a compatible engine when none is available.',
  'engines.default': 'Used when a request does not specify an engine.',
  'models.autoLoad': 'Separate model IDs with commas.',
  'managed.image': 'Leave empty to use the supported container image.',
  'proxy.url': 'Outbound proxy for catalogs and downloads.',
  'proxy.noProxy': 'Separate hostnames with commas.',
  'proxy.ignoreSsl': 'Allow downloads without verifying the proxy certificate.',
  'tui.motion': 'Animate the terminal interface.',
  'tui.mouse': 'Use Ctrl+X in the terminal to release mouse capture for selecting text.',
  'telemetry.enabled': 'Send crash and error reports.',
}
export function RuntimeSettingRow({
  field,
  value,
  arrayText,
  disabled,
  update,
}: {
  field: RecordValue
  value: unknown
  arrayText?: string
  disabled: boolean
  update: (value: unknown, arrayText?: string) => void
}) {
  const id = useId()
  const path = text(field.path)
  const label = SETTING_LABELS[path] ?? path.split('.').slice(1).join('.')
  const options = Array.isArray(field.values) ? field.values : []
  const type = text(field.type, typeof value)
  const hint = hints[path]
  const error = runtimeSettingError(field, value)
  const controlProps = {
    id,
    disabled,
    'aria-labelledby': `${id}-label`,
    'aria-invalid': Boolean(error),
    'aria-describedby': [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined,
  }
  return (
    <div className="settings-item">
      <label htmlFor={id}>
        <strong id={`${id}-label`}>{label}</strong>
        {hint && <small id={`${id}-hint`}>{hint}</small>}
      </label>
      <div className="settings-item-control">
        {options.length ? (
          <select {...controlProps} value={text(value, '')} onChange={(e) => update(e.target.value)}>
            {options.map((option) => (
              <option key={text(option)} value={text(option)}>
                {path === 'engines.default' ? engineName(text(option)) : text(option)}
              </option>
            ))}
          </select>
        ) : type === 'boolean' ? (
          <input
            {...controlProps}
            type="checkbox"
            role="switch"
            checked={Boolean(value)}
            onChange={(e) => update(e.target.checked)}
          />
        ) : (
          <input
            {...controlProps}
            type={type === 'number' ? 'number' : /token|password/.test(path) ? 'password' : 'text'}
            min={typeof field.min === 'number' ? field.min : undefined}
            max={typeof field.max === 'number' ? field.max : undefined}
            value={Array.isArray(value) ? (arrayText ?? value.join(', ')) : text(value, '')}
            onWheel={type === 'number' ? (event) => event.currentTarget.blur() : undefined}
            onChange={(e) =>
              update(
                Array.isArray(value)
                  ? e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : e.target.value,
                Array.isArray(value) ? e.target.value : undefined
              )
            }
          />
        )}
        {error && (
          <p id={`${id}-error`} className="ew-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
