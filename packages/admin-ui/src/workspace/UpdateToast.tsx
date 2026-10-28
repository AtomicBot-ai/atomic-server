import { useState } from 'react'
import { X } from 'lucide-react'
import { Copy } from './Controls'
import type { Workspace } from './useWorkspace'
import './update-toast.css'

/** Where a dismissed release's version is kept, so the notice stays away until the next one. */
const DISMISSED = 'atc.update.dismissed'

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED) ?? ''
  } catch {
    return ''
  }
}

/**
 * The notice, bottom right, that a newer atc is out (the workspace snapshot's `atc`, from the server's
 * own look at releases): the versions, what installs it, the release page. Dismissed per release.
 * `top` puts it top right, on the chat page, whose composer owns the bottom.
 */
export function UpdateToast({ workspace: w, top = false }: { workspace: Workspace; top?: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const atc = w.snapshot?.atc
  const update = atc?.update
  if (!atc || !update || dismissed === update.version) return null
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, update.version)
    } catch {
      // No storage: the notice comes back with the next page load.
    }
    setDismissed(update.version)
  }
  return (
    <aside className={`update-toast${top ? ' update-toast-top' : ''}`} role="status">
      <div className="update-toast-body">
        <strong>atc {update.version} is out</strong>
        <small>you run {atc.version}</small>
        {update.command ? (
          <span className="update-toast-command">
            <code>{update.command}</code>
            <Copy value={update.command} label="Copy command" />
          </span>
        ) : null}
        <a href={update.url} target="_blank" rel="noreferrer">
          Release notes
        </a>
      </div>
      <button type="button" className="update-toast-close" aria-label="Dismiss" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}
