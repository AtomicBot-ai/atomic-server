import { useEffect, useState } from 'react'
import { describeError } from '@/services/admin-api'
import type { Execute } from '../../types'

/** Re-read core verdicts after returning from engine preparation without resetting the choice. */
export function useVariantModel<T extends { model_id: string }>(
  initial: T,
  engine: string,
  revision: number,
  execute: Execute
) {
  const [model, setModel] = useState(initial)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let closed = false
    setError('')
    if (!revision) {
      setModel(initial)
      return
    }
    setChecking(true)
    void execute<{ models: T[] }>('models.search', { engine, query: initial.model_id })
      .then((result) => {
        if (closed) return
        const current = result.models.find((item) => item.model_id === initial.model_id)
        if (!current) throw new Error('This model is no longer in the engine catalog.')
        setModel(current)
      })
      .catch((failure) => {
        if (!closed) setError(describeError(failure))
      })
      .finally(() => {
        if (!closed) setChecking(false)
      })
    return () => {
      closed = true
    }
  }, [execute, initial, revision, engine])
  return { model, checking, error }
}
