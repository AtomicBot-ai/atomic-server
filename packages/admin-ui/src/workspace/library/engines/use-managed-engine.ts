import { useCallback, useEffect, useState } from 'react'
import type { ManagedEngineState } from '@contract'
import { engineRefreshKey } from '@view'
import { describeError } from '@/services/admin-api'
import type { Workspace } from '../../useWorkspace'
import { useEngineInstall } from './use-engine-install'

/** Keep a managed request locked across dialog reopen; consent remains bound to the displayed plan. */
export function useManagedEngine(w: Workspace, engine: string) {
  const [continuing, setContinuing] = useState(false)
  const [state, setState] = useState<ManagedEngineState | null>(null)
  const { busy, run, refreshKey } = useEngineInstall(w, engine)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { execute } = w
  const key = engineRefreshKey(engine, w.snapshot)
  const read = useCallback(async () => {
    try {
      setState(await execute<ManagedEngineState>('engines.plan', { engine }))
    } catch (e) {
      setError(describeError(e))
    }
  }, [execute, engine])
  useEffect(() => {
    void read()
  }, [read, key, refreshKey])
  const act = (work: () => Promise<unknown>, navigating = false) =>
    run(async () => {
      setContinuing(navigating)
      setError('')
      setNotice('')
      try {
        await work()
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === 'MANAGED_PLAN_CHANGED')
          setNotice('The plan changed since it was shown: review it and agree again.')
        else setError(describeError(e))
      } finally {
        setContinuing(false)
        await read()
      }
    })
  return { state, busy, error, notice, continuing, act }
}
