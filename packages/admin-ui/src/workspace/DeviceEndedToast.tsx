import { useState } from 'react'
import { X } from 'lucide-react'
import { endedNotice } from '@view'
import type { AccountRemoteEnded } from '@contract'
import type { Workspace } from './useWorkspace'
import './update-toast.css'

const key = (ended: AccountRemoteEnded) => `${ended.grant_id}:${ended.at}`

/**
 * The notice that a device's access ended from its side (it disconnected, another device revoked it, it
 * signed out): the newest such device, how many more, and Dismiss, which keeps those entries away. The server
 * lists them for a few minutes (`snapshot.account.remote.ended`).
 */
export function DeviceEndedToast({ workspace: w }: { workspace: Workspace }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const account = w.snapshot?.account
  const shown = account?.enabled ? account.remote.ended.filter((e) => !dismissed.has(key(e))) : []
  const newest = shown[0]
  if (!newest) return null
  const more = shown.length - 1
  return (
    <aside className="update-toast access-toast" role="status">
      <div className="update-toast-body">
        <strong>Device disconnected</strong>
        <span className="access-toast-notice">
          {`${endedNotice(newest)}${more > 0 ? ` (and ${more} more)` : ''}. It pairs again to use it.`}
        </span>
      </div>
      <button
        type="button"
        className="update-toast-close"
        aria-label="Dismiss"
        onClick={() => setDismissed((set) => new Set([...set, ...shown.map(key)]))}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
