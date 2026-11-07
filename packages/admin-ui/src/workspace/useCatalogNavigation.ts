import { useEffect, useState } from 'react'
import type { Page } from './types'

/** Explicit Browse models intent applies to that visit, never to a later ordinary entry. */
export function useCatalogNavigation(page: Page) {
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [engine, setEngine] = useState<{ engine: string; opened: number } | null>(null)
  useEffect(() => {
    if (page !== 'catalog') {
      setEngine(null)
      setCategory(undefined)
    }
  }, [page])
  return {
    catalogCategory: category,
    catalogFor: engine,
    openCatalog: (engine?: string, category?: string) => {
      setCategory(category)
      setEngine(engine ? { engine, opened: Date.now() } : null)
    },
  }
}
