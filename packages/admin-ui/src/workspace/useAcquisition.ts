import { useEffect } from 'react'
import type { Page } from './types'
export function useAcquisition(
  setPage: (page: Page) => void,
  setCatalog: (section: string) => void,
  setServer: (section: string) => void
) {
  useEffect(() => {
    const acquire = (event: Event) => {
      const target = (event as CustomEvent).detail
      if (target === 'server') {
        setServer('overview')
        setPage('server')
        return
      }
      if (!['catalog', 'downloads', 'engines'].includes(target)) return
      setCatalog(target)
      setPage('catalog')
    }
    window.addEventListener('atomic:acquire', acquire)
    return () => window.removeEventListener('atomic:acquire', acquire)
  }, [setPage, setCatalog, setServer])
}
export function openAcquisition(target: string | null) {
  if (target) window.dispatchEvent(new CustomEvent('atomic:acquire', { detail: target }))
}
