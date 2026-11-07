import { useId, useRef, useState } from 'react'
import type { ChangeEvent, Ref } from 'react'
import { describeError } from '@/services/admin-api'
import './file-input.css'

/** Own the visible English copy; the OS picker still uses the user's system language. */
export function FileInput({
  label,
  accept,
  disabled,
  hint,
  triggerRef,
  onChange,
}: {
  label: string
  accept?: string
  disabled?: boolean
  hint?: string
  triggerRef?: Ref<HTMLButtonElement>
  onChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="ew-field file-input">
      <span id={`${id}-label`}>{label}</span>
      <div className="file-input-row">
        <button
          type="button"
          className="ew-button"
          ref={triggerRef}
          disabled={disabled || reading}
          aria-label={`Choose file ${label}`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onClick={(event) => {
            // Opening a picker is not a completed menu action; keep its input mounted.
            event.stopPropagation()
            input.current?.click()
          }}
        >
          <span id={`${id}-button`}>Choose file</span>
        </button>
        <span className="file-input-name" aria-live="polite">
          {name || 'No file selected'}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        aria-label={label}
        accept={accept}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled || reading}
        onChange={async (event) => {
          const element = event.currentTarget
          const file = element.files?.[0]
          if (!file) return
          setName(file.name)
          setReading(true)
          setError('')
          try {
            await onChange(event)
          } catch (failure) {
            setError(describeError(failure))
          } finally {
            element.value = ''
            setReading(false)
          }
        }}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small className="ew-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
