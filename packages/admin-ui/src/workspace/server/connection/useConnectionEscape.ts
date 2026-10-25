import { useEffect } from 'react'

/** Escape dismisses an existing-server guide; inner menus and dialogs consume it first. */
export function useConnectionEscape(onClose: () => void, preparing: boolean) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || preparing) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose, preparing])
}
