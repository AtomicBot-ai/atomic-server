import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { formatSize } from '@view'
import { text, type RecordValue } from '../../types'
import { useDialog } from '../../useDialog'

export function StrataQuantMenu({
  variants,
  selected,
  disabled,
  onChange,
}: {
  variants: RecordValue[]
  selected: RecordValue
  disabled: boolean
  onChange: (id: string) => void
}) {
  const label = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const dialog = useDialog(() => setPosition(null), position !== null)
  useEffect(() => {
    if (!position) return
    dialog.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
    const close = () => setPosition(null)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [dialog, position])
  return (
    <div className="strata-quant">
      <small id={label}>Quantization</small>
      <button
        ref={trigger}
        type="button"
        className="strata-quant-trigger"
        aria-labelledby={`${label} ${label}-value`}
        aria-haspopup="dialog"
        aria-expanded={position !== null}
        disabled={disabled}
        onClick={() => {
          const bounds = trigger.current!.getBoundingClientRect()
          const width = Math.min(240, window.innerWidth - 16)
          setPosition({
            top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - 284)),
            left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
            width,
          })
        }}
      >
        <span id={`${label}-value`}>{text(selected.label ?? selected.id)}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {position &&
        createPortal(
          <section
            ref={dialog}
            className="strata-quant-menu"
            style={position}
            role="dialog"
            aria-modal="true"
            aria-label="Choose quantization"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
              const items = Array.from(event.currentTarget.querySelectorAll('button'))
              const index = items.indexOf(document.activeElement as HTMLButtonElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              items[next]?.focus()
              event.preventDefault()
            }}
          >
            {variants.map((variant) => (
              <button
                key={text(variant.id)}
                type="button"
                aria-pressed={variant.id === selected.id}
                onClick={() => {
                  onChange(text(variant.id))
                  setPosition(null)
                }}
              >
                <span>{text(variant.label ?? variant.id)}</span>
                {typeof variant.size_bytes === 'number' && variant.size_bytes > 0 && (
                  <small>{formatSize(variant.size_bytes)}</small>
                )}
                {variant.id === selected.id && <Check size={13} aria-hidden />}
              </button>
            ))}
          </section>,
          document.querySelector('.desktop-workspace') ?? document.body
        )}
    </div>
  )
}
