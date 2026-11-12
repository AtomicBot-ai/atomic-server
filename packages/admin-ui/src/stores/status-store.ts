/**
 * `GET /api/status` as a store: the dashboard and the header read it, the relay's events refetch
 * it. A 401 flips `unauthorized`, which is how the root layout knows to show the sign-in screen.
 */

import { create } from 'zustand'
import type { AdminStatus } from '@contract'
import { getServiceHub } from '@/hooks/useServiceHub'
import { describeError, isUnauthorized } from '@/services/admin-api'

export interface StatusState {
  status: AdminStatus | null
  loading: boolean
  error: string | null
  /** The BFF answered 401: there is no session. */
  unauthorized: boolean
  updatedAt: number | null
  /** Refetch now. One request at a time; a call during a fetch queues exactly one more. */
  refresh(): Promise<void>
  reset(): void
}

const initial = { status: null, loading: false, error: null, unauthorized: false, updatedAt: null }

let inflight: Promise<void> | null = null
let queued = false

export const useStatusStore = create<StatusState>()((set, get) => ({
  ...initial,

  refresh() {
    if (inflight) {
      queued = true
      return inflight
    }
    set({ loading: true })
    inflight = (async () => {
      try {
        const status = await getServiceHub().status().fetch()
        set({ status, loading: false, error: null, unauthorized: false, updatedAt: Date.now() })
      } catch (error) {
        if (isUnauthorized(error)) set({ status: null, loading: false, error: null, unauthorized: true })
        else set({ loading: false, error: describeError(error) })
      } finally {
        inflight = null
      }
      if (queued) {
        queued = false
        await get().refresh()
      }
    })()
    return inflight
  },

  reset() {
    queued = false
    set({ ...initial })
  },
}))
