import { watchSharedRead } from './watch-shared-read'
import { useEffect, useState } from 'react'
import { orderEngines } from '@view'
import { describeError } from '@/services/admin-api'
import type { Workspace } from './useWorkspace'
import { rows, text } from './types'
import type { RecordValue } from './types'

/**
 * The engines the core registers on this host (`engines.list`), in the order both UIs show them
 * (llama.cpp, MLX, then vLLM, SGLang, TensorRT-LLM, then Foundry Local). Never a list kept here.
 */
export function useEngines(execute: Workspace['execute'], revision = 0) {
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    setLoading(true)
    setError('')
    return watchSharedRead(
      () => execute('engines.list'),
      (result) => {
        const all = rows(result)
        const order = orderEngines(all.map((e) => text(e.engine)))
        setEngines(order.map((id) => all.find((e) => text(e.engine) === id)!))
        setLoading(false)
        setError('')
      },
      (e) => {
        setError(describeError(e))
        setLoading(false)
      }
    )
  }, [execute, revision])
  return { engines, loading, error }
}
