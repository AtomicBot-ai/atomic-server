import { useEffect, useRef } from 'react'

/** Keep keyboard focus inside the topmost dialog, and restore it on close. */
export function useDialog(onClose: () => void, active = true) {
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    root?.focus()
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (event.defaultPrevented || !root || dialogs[dialogs.length - 1] !== root) return
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
      const outside = !root.contains(document.activeElement)
      if (
        event.shiftKey &&
        (outside || document.activeElement === first || document.activeElement === root)
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (outside || document.activeElement === last || document.activeElement === root)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    const onOutside = (event: MouseEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (!root || dialogs[dialogs.length - 1] !== root || root.contains(event.target as Node)) return
      // Consume the whole click: dismissing a dialog must not activate the page below it.
      event.preventDefault()
      event.stopImmediatePropagation()
      close.current()
    }
    document.addEventListener('click', onOutside, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onOutside, true)
      document.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
      if (!previous?.isConnected || document.activeElement !== previous) {
        const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]')
        const parent = dialogs[dialogs.length - 1]
        parent?.focus()
        if (parent && document.activeElement !== parent)
          parent
            .querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
            ?.focus()
      }
    }
  }, [active])
  return ref
}
