// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared server workspace destinations.
import { useState } from 'react'
import { describeError } from '@/services/admin-api'
import { ChevronRight, Network, Terminal } from 'lucide-react'
import { DirectoryRow } from '../DirectoryRow'

export function Destinations({
  choose,
}: {
  choose: (destination: 'endpoint' | 'agents') => void | Promise<void>
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
    </>
  )
}
