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
    let active = true
    setLoading(true)
    setError('')
    void execute('engines.list')
      .then((result) => {
        if (!active) return
        const all = rows(result)
        const order = orderEngines(all.map((e) => text(e.engine)))
        setEngines(order.map((id) => all.find((e) => text(e.engine) === id)!))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [execute, revision])
  return { engines, loading, error }
}
