import { useEffect, useRef } from 'react'

/** Keep a model-check retry in context when its action disappears or is disabled. */
export function useConnectionRetryFocus(checking: boolean, error: string, retry: () => void) {
  const ref = useRef<HTMLElement>(null)
  const requested = useRef(false)
  useEffect(() => {
    if (checking || !requested.current) return
    requested.current = false
    const active = document.activeElement
    if (
      active &&
      active !== document.body &&
      active !== ref.current &&
      active.getAttribute('aria-label') !== 'Retry model check'
    )
      return
    ref.current
      ?.querySelector<HTMLElement>(error ? '[aria-label="Retry model check"]' : '[name="model"]')
      ?.focus()
  }, [checking, error])
  return {
    ref,
    retry: () => {
      requested.current = true
      retry()
    },
  }
}
