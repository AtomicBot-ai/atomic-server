import { Field } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { descriptorDefault, inactiveSetting } from './engine-setting-groups'
export function EngineSettingField({
  field,
  values,
  saved,
  update,
}: {
  field: RecordValue
  values: RecordValue
  saved: RecordValue
  update: (name: string, value: unknown) => void
}) {
  const name = text(field.key),
    props = record(field.controllerProps),
    options = Array.isArray(props.options) ? props.options : []
  const disabled = inactiveSetting(field, values),
    value = values[name] ?? descriptorDefault(field) ?? ''
  return (
    <div className={`engine-setting ${values[name] !== saved[name] ? 'setting-changed' : ''}`}>
      <Field label={text(field.title, name)}>
        {field.controllerType === 'checkbox' ? (
          <select
            disabled={Boolean(disabled)}
            value={String(value)}
            onChange={(e) => update(name, e.target.value === 'true')}
          >
            <option value="false">Off</option>
            <option value="true">On</option>
          </select>
        ) : options.length ? (
          <select
            disabled={Boolean(disabled)}
            value={text(value, '')}
            onChange={(e) => update(name, e.target.value)}
          >
            {options.map((option, i) => (
              <option key={i} value={typeof option === 'string' ? option : text(record(option).value)}>
                {typeof option === 'string' ? option : text(record(option).label ?? record(option).value)}
              </option>
            ))}
          </select>
        ) : (
          <input
            disabled={Boolean(disabled)}
            value={text(value, '')}
            type={props.type === 'number' ? 'number' : 'text'}
            min={typeof props.min === 'number' ? props.min : undefined}
            max={typeof props.max === 'number' ? props.max : undefined}
            onChange={(e) =>
              update(
                name,
                e.target.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value
              )
            }
          />
        )}
      </Field>
      {disabled && <small>{disabled}</small>}
      <details>
        <summary>Details & default{values[name] !== saved[name] ? ' · changed' : ''}</summary>
        <p>{text(field.description, '')}</p>
        <p>
          Key: <code>{name}</code>
        </p>
        <p>
          Saved: {text(saved[name], 'Inherited')} · Descriptor default:{' '}
          {text(descriptorDefault(field), 'Not reported')}
        </p>
        {descriptorDefault(field) !== undefined && (
          <button
            className="ew-button"
            disabled={Boolean(disabled)}
            onClick={() => update(name, descriptorDefault(field))}
          >
            Stage default
          </button>
        )}
      </details>
    </div>
  )
}
