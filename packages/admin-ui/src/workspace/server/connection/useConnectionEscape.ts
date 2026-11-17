import { useEffect, type RefObject } from 'react'

/** Escape dismisses an existing-server guide; inner menus and dialogs consume it first. */
export function useConnectionEscape(
  onClose: () => void,
  preparing: boolean,
  scope?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const root = scope?.current
    const target: HTMLElement | Document = root ?? document
    const close = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      if (event.key !== 'Escape' || event.defaultPrevented || preparing) return
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (dialogs.length && dialogs[dialogs.length - 1] !== root?.closest('[aria-modal="true"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    target.addEventListener('keydown', close)
    return () => target.removeEventListener('keydown', close)
  }, [onClose, preparing, scope])
}
