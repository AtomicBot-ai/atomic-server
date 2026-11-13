import { useState } from 'react'
import { X } from 'lucide-react'
import { requestNotice } from '@view'
import { Action } from './Controls'
import type { Workspace } from './useWorkspace'
import './update-toast.css'

/**
 * The notice that a device asks for access to this server (the newest request, with its check code), and
 * Review, which opens Server → Remote access to allow or deny it. Dismissed until a newer request comes;
 * `hidden` on the page that lists the requests already.
 */
export function AccessRequestToast({
  workspace: w,
  onReview,
  hidden = false,
}: {
  workspace: Workspace
  onReview: () => void
  hidden?: boolean
}) {
  const [dismissed, setDismissed] = useState('')
  const account = w.snapshot?.account
  const request = account?.enabled ? account.remote.requests.at(-1) : undefined
  const notice = account?.enabled ? requestNotice(account) : null
  if (hidden || !request || !notice || dismissed === request.grant_id) return null
  return (
    <aside className="update-toast access-toast" role="status">
      <div className="update-toast-body">
        <strong>Access request</strong>
        <span className="access-toast-notice">{notice}</span>
        <span className="access-toast-actions">
          <Action primary onClick={onReview}>
            Review
          </Action>
        </span>
      </div>
      <button
        type="button"
        className="update-toast-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(request.grant_id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
