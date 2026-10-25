import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useDialog } from '../useDialog'

/** Compact desktop options, with keyboard navigation and one Escape to dismiss. */
export function ChatMenu({ label, children }: { label: string; children: ReactNode }) {
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const open = Boolean(position)
  const dialog = useDialog(() => setPosition(null), open)
  const place = useCallback(() => {
    const bounds = trigger.current!.getBoundingClientRect()
    const top = Math.min(bounds.bottom + 6, Math.max(8, window.innerHeight - 300))
    setPosition({
      top,
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 244)),
      maxHeight: window.innerHeight - top - 8,
    })
  }, [])
  useEffect(() => {
    if (!open) return
    dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, dialog, place])
  return (
    <>
      <button
        ref={trigger}
        className="chat-icon-button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={Boolean(position)}
        onClick={place}
      >
        <Ellipsis size={18} />
      </button>
      {position &&
        createPortal(
          <div className="chat-menu-shade">
            <section
              ref={dialog}
              className="chat-options-menu"
              style={position}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                if (event.target instanceof HTMLInputElement) return
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), summary'
                  ),
                ]
                const current = items.indexOf(document.activeElement as HTMLElement)
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                items[next]?.focus()
                event.preventDefault()
              }}
            >
              {children}
            </section>
          </div>,
          document.querySelector('.desktop-workspace') ?? document.body
        )}
    </>
  )
}
