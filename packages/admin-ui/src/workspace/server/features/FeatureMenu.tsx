import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
/** Keyboard-openable menu with the same outside-click and Escape dismissal as dialogs. */
export function FeatureMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
        event.preventDefault()
      }
    }
    document.addEventListener('click', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('click', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div className="feature-menu" ref={ref}>
      <button
        className="feature-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          onChange={() => setOpen(false)}
          onClick={(event) => {
            if ((event.target as Element).closest('button')) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
