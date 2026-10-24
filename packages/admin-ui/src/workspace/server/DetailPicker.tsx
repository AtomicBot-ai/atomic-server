// Lifted from Atomic-Chat/web-app/src/containers/server-concept/EngineModelFields.tsx @ 5043013; adapted: dependency-free, accessible listbox with real server choices.
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './detail-picker.css'

export type DetailChoice = { id: string; name: string; icon: ReactNode; detail?: string; metadata?: string }

function ChoiceRow({ choice }: { choice: DetailChoice }) {
  return (
    <>
      {choice.icon}
      <span className="server-picker-copy">
        <strong>{choice.name}</strong>
        {choice.detail && <span>{choice.detail}</span>}
        {choice.metadata && <small>{choice.metadata}</small>}
      </span>
    </>
  )
}

export function DetailPicker({
  label,
  name,
  value,
  choices,
  placeholder,
  disabled = false,
  onChange,
}: {
  label: string
  name?: string
  value: string
  choices: DetailChoice[]
  placeholder: string
  disabled?: boolean
  onChange: (id: string) => void
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState('')
  const active = Math.max(
    0,
    choices.findIndex((choice) => choice.id === activeId)
  )
  const [above, setAbove] = useState(false)
  const [height, setHeight] = useState(320)
  const selected = choices.find((choice) => choice.id === value)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const show = (last = false) => {
    if (disabled || !choices.length) return
    const bounds = trigger.current?.getBoundingClientRect()
    const below = bounds ? window.innerHeight - bounds.bottom - 12 : 320
    const before = bounds ? bounds.top - 12 : 320
    const upwards = below < 240 && before > below
    setAbove(upwards)
    setHeight(Math.max(96, Math.min(360, upwards ? before : below)))
    setActiveId(
      (last ? choices.at(-1) : (choices.find((choice) => choice.id === value) ?? choices[0]))?.id ?? ''
    )
    search.current = { text: '', time: 0 }
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    root.current
      ?.querySelector<HTMLElement>(`[data-choice-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !root.current?.querySelector('[role="listbox"]')?.contains(target) &&
        !trigger.current?.contains(target)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
  const choose = (index: number) => {
    const option = choices[index]
    if (option) onChange(option.id)
    close()
  }
  return (
    <div
      ref={root}
      className="server-picker-field"
      data-popup-open={open || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        name={name}
        value={value}
        role="combobox"
        className="server-detail-picker"
        aria-labelledby={`${id}-label`}
        aria-describedby={selected ? `${id}-value` : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        disabled={disabled || !choices.length}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            close()
            return
          }
          if (event.key === 'Tab') {
            setOpen(false)
            return
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            if (!open) show(event.key === 'ArrowUp' || event.key === 'End')
            else {
              const index =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? choices.length - 1
                    : (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
              setActiveId(choices[index]?.id ?? '')
            }
            return
          }
          if (open && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            choose(active)
            return
          }
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key !== ' '
          ) {
            event.preventDefault()
            if (!open) show()
            const now = Date.now()
            const query =
              (now - search.current.time < 700 ? search.current.text : '') + event.key.toLowerCase()
            search.current = { text: query, time: now }
            const match = choices.findIndex((choice) => choice.name.toLowerCase().startsWith(query))
            if (match >= 0) setActiveId(choices[match].id)
          }
        }}
      >
        <span id={`${id}-value`} className="server-picker-identity">
          {selected ? <ChoiceRow choice={selected} /> : <span>{placeholder}</span>}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`server-picker-menu ${above ? 'opens-above' : ''}`}
          style={{ maxHeight: height }}
        >
          {choices.map((choice, index) => (
            <div
              key={choice.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={choice.id === value}
              className={`server-picker-option ${active === index ? 'is-active' : ''}`}
              data-choice-index={index}
              onPointerMove={() => setActiveId(choice.id)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <ChoiceRow choice={choice} />
              {choice.id === value && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
