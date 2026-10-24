// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared server workspace destinations.
import { useState } from 'react'
import { describeError } from '@/services/admin-api'
import { ArrowRight, Server, Terminal } from 'lucide-react'
export function Destinations({
  choose,
}: {
  choose: (destination: 'endpoint' | 'agents') => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="first-purpose-grid">
        <button disabled={busy} onClick={() => void run(() => choose('endpoint'))}>
          <Server size={30} />
          <h2>Configure an endpoint</h2>
          <p>Choose a host and port, set an API key, and start your server.</p>
          <span>
            Show me the settings <ArrowRight size={17} />
          </span>
        </button>
        <button disabled={busy} onClick={() => void run(() => choose('agents'))}>
          <Terminal size={30} />
          <h2>Connect an agent</h2>
          <p>Choose Claude Code, Codex CLI, or another tool and test its connection.</p>
          <span>
            Explore agents & tools <ArrowRight size={17} />
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
    </>
  )
}
