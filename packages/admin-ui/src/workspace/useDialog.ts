import { useEffect, useRef } from 'react'

/** Keep keyboard focus inside the topmost dialog, and restore it on close. */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    root?.focus()
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (!root || dialogs[dialogs.length - 1] !== root) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close.current()
      }
      if (event.key !== 'Tab') return
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]'
        )
      ).filter((item) => item.getClientRects().length > 0)
      const first = items[0],
        last = items[items.length - 1]
      if (!first || !last) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [])
  return ref
}
