import { useEffect, useState } from 'react'
import { ACCOUNT_POLL_MS } from '@view'

/**
 * While a device sign-in or a pairing code waits, read the snapshot every `ACCOUNT_POLL_MS` rather than at
 * the workspace's slower pace, so the page moves on as soon as the other device answers.
 */
export function useAccountPoll(refresh: () => Promise<unknown>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, ACCOUNT_POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, active])
}

/** The clock a countdown reads: ms since the epoch, read again every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [active])
  // The render that turns the clock on comes before its first tick: never show a countdown from then.
  return active ? Math.max(now, Date.now()) : now
}
