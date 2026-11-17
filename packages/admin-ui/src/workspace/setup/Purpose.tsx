// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared server workspace destinations.
import { useRef, useState } from 'react'
import type { WorkspaceSnapshot } from '@contract'
import { describeError } from '@/services/admin-api'
import { ChevronRight, Network, Terminal } from 'lucide-react'
import { DirectoryRow } from '../DirectoryRow'

export function Destinations({
  choose,
  refresh,
}: {
  choose: (destination: 'endpoint' | 'agents', snapshot: WorkspaceSnapshot | null) => void | Promise<void>
  refresh: () => Promise<WorkspaceSnapshot | null>
}) {
  const [busy, setBusy] = useState(false)
  const choosing = useRef(false)
  const [error, setError] = useState('')
  const run = async (destination: 'endpoint' | 'agents') => {
    if (choosing.current) return
    choosing.current = true
    setBusy(true)
    setError('')
    try {
      await choose(destination, await refresh())
    } catch (e) {
      setError(describeError(e))
    } finally {
      choosing.current = false
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
