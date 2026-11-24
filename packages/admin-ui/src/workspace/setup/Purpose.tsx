// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared server workspace destinations.
import { useState } from 'react'
import { describeError } from '@/services/admin-api'
import { ChevronRight, Network, Terminal } from 'lucide-react'
import type { WorkspaceAccount } from '@contract'
import { DirectoryRow } from '../DirectoryRow'

export function Destinations({
  choose,
  account,
}: {
  choose: (destination: 'endpoint' | 'agents') => void | Promise<void>
  /** While accounts are on and nobody is signed in, the last step says how to share the server. */
  account?: WorkspaceAccount
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (destination: 'endpoint' | 'agents') => {
    setBusy(true)
    setError('')
    try {
      await choose(destination)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <ul className="directory-list">
        <li>
          <DirectoryRow
            title="Configure an endpoint"
            detail="Set the address and port for your API."
            leading={<Network size={20} aria-hidden="true" />}
            trailing={<ChevronRight size={16} aria-hidden="true" />}
            disabled={busy}
            onClick={() => void run('endpoint')}
          />
        </li>
        <li>
          <DirectoryRow
            title="Connect an agent"
            detail="Connect a coding agent such as Codex CLI or Claude Code."
            leading={<Terminal size={20} aria-hidden="true" />}
            trailing={<ChevronRight size={16} aria-hidden="true" />}
            disabled={busy}
            onClick={() => void run('agents')}
          />
        </li>
      </ul>
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
      {account?.enabled && !account.signed_in && (
        <p className="first-run-account-hint">
          Share this server with your devices: <code>atc login</code>
        </p>
      )}
    </>
  )
}
