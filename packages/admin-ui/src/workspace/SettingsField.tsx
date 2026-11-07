import { cloneElement, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ReactElement, ReactNode, InputHTMLAttributes } from 'react'
import './settings-form.css'

type Control = InputHTMLAttributes<HTMLInputElement>

/** A native control with a stable label, hint, error and a shared settings column. */
export function SettingsField({
  label,
  hint,
  error,
  unit,
  actions,
  children,
  layout = 'row',
}: {
  layout?: 'row' | 'stacked'
  label: string
  hint?: string
  error?: string
  unit?: string
  actions?: ReactNode
  children: ReactElement<Control>
}) {
  const generated = useId()
  const id = children.props.id ?? generated
  const compact = children.props.type === 'number'
  const select = children.type === 'select'
  const multiline = children.type === 'textarea'
  const describedBy =
    [children.props['aria-describedby'], hint && `${id}-hint`, unit && `${id}-unit`, error && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div
      className={`settings-field ${layout === 'stacked' ? 'settings-field-stacked ew-field' : ''} ${compact ? 'settings-field-number' : ''} ${multiline ? 'settings-field-multiline' : ''}`}
    >
      <div className="settings-field-copy">
        <label htmlFor={id}>{label}</label>
        {hint && <p id={`${id}-hint`}>{hint}</p>}
      </div>
      <div className="settings-field-control">
        <div className={`settings-field-input ${select ? 'settings-field-select' : ''}`}>
          {cloneElement(children, {
            id,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : children.props['aria-invalid'],
          })}
          {select && <ChevronDown className="settings-field-chevron" size={14} aria-hidden="true" />}
          {unit && (
            <span id={`${id}-unit`} className="settings-field-unit">
              {unit}
            </span>
          )}
        </div>
        {actions && <div className="settings-field-actions">{actions}</div>}
        {error && (
          <p id={`${id}-error`} className="settings-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
