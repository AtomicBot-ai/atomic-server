import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../useWorkspace'
export function useConnectorSignIn(w: Workspace, fail: (message: string) => void) {
  const [waiting, setWaiting] = useState<{ id: string; name: string; url: string; error?: string } | null>(
    null
  )
  const current = useRef('')
  const generation = useRef(0)
  const execute = useRef(w.execute)
  execute.current = w.execute
  const onError = useRef(fail)
  onError.current = fail
  const cancel = async () => {
    generation.current++
    const id = current.current
    current.current = ''
    setWaiting(null)
    if (id) await execute.current('connectors.oauth.cancel', { id })
  }
  useEffect(() => {
    if (!waiting?.url) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const value = await execute.current<{ state: string; error?: string }>('connectors.oauth.status', {
          id: waiting.id,
        })
        if (stopped) return
        if (value.state === 'complete') {
          await execute.current('connectors.check', { id: waiting.id })
          if (!stopped) {
            current.current = ''
            setWaiting(null)
          }
        } else if (value.state === 'error' || value.state === 'cancelled' || value.state === 'idle') {
          current.current = ''
          setWaiting(null)
          if (value.state === 'error') onError.current(value.error || 'Sign-in failed. Try again.')
        } else timer = setTimeout(() => void poll(), 1000)
      } catch (error) {
        if (!stopped) {
          current.current = ''
          setWaiting(null)
          onError.current(error instanceof Error ? error.message : String(error))
        }
      }
    }
    timer = setTimeout(() => void poll(), 700)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [waiting])
  useEffect(
    () => () => {
      generation.current++
      if (current.current)
        void execute.current('connectors.oauth.cancel', { id: current.current }).catch(() => undefined)
    },
    []
  )
  const start = async (id: string, name: string, clientId = '') => {
    const attempt = ++generation.current
    try {
      const auth = await execute.current<{ url: string }>('connectors.oauth.start', {
        id,
        ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
      })
      if (attempt !== generation.current) {
        await execute.current('connectors.oauth.cancel', { id })
        return
      }
      current.current = id
      setWaiting({ id, name, url: auth.url })
    } catch (error) {
      if (attempt !== generation.current) return
      current.current = ''
      setWaiting({ id, name, url: '', error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { waiting, start, cancel }
}
