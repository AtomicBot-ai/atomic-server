import { useCallback, useEffect, useRef, useState } from 'react'
import { WORKSPACE_OPERATIONS } from '@contract'
import type { WorkspaceInput, WorkspaceOperation, WorkspaceSnapshot } from '@contract'
import { describeError, isUnauthorized } from '@/services/admin-api'
import { useStatusStore } from '@/stores/status-store'
import { workspaceApi } from './workspace-api'

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [operations, setOperations] = useState<WorkspaceOperation[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const active = useRef(true)
  const requestId = useRef(0)
  const appliedId = useRef(0)
  /** Reads the server's snapshot now; resolves with it, or null when the server could not answer. */
  const operationsKnown = useRef(false)
  const readOperations = useCallback(async () => {
    const list = await workspaceApi.operations()
    if (!active.current) return
    operationsKnown.current = true
    setOperations(list)
  }, [])
  const refresh = useCallback(async (): Promise<WorkspaceSnapshot | null> => {
    const id = ++requestId.current
    try {
      const result = await workspaceApi.snapshot()
      // The operations are read once; a first read that failed is tried again with the next poll.
      if (!operationsKnown.current) void readOperations().catch(() => undefined)
      if (active.current && id > appliedId.current) {
        appliedId.current = id
        setSnapshot(result)
        setError('')
      }
      return result
    } catch (e) {
      if (active.current && id > appliedId.current) {
        appliedId.current = id
        setError(describeError(e))
      }
      if (isUnauthorized(e)) useStatusStore.setState({ unauthorized: true, status: null })
      return null
    } finally {
      if (active.current) setLoading(false)
    }
  }, [readOperations])
  useEffect(() => {
    active.current = true
    void refresh()
    void readOperations().catch((e) => setError(describeError(e)))
    const timer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 2500)
    const visible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      active.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh, readOperations])
  const execute = useCallback(
    async <T = unknown>(operation: string, input: WorkspaceInput = {}): Promise<T> => {
      setPending((items) => [...items, operation])
      try {
        const result = await workspaceApi.execute<T>(operation, input)
        if (WORKSPACE_OPERATIONS.find((item) => item.name === operation)?.mutates !== false) await refresh()
        return result
      } finally {
        if (active.current)
          setPending((items) => {
            const next = [...items]
            next.splice(next.indexOf(operation), 1)
            return next
          })
      }
    },
    [refresh]
  )
  return { snapshot, operations, error, loading, pending, execute, refresh }
}
export type Workspace = ReturnType<typeof useWorkspace>
