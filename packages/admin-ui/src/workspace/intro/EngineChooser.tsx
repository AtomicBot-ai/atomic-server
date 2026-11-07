import { useEffect, useState } from 'react'
import { engineFamily, engineName } from '@view'
import { describeError } from '@/services/admin-api'
import type { Workspace } from '../useWorkspace'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'
import { EngineSetup } from '../library/engines/EngineSetup'

/** Managed engines explain prerequisites in their plan, even before a runtime is installed. */
const offered = (e: RecordValue) =>
  engineFamily(text(e.engine)) === 'managed' ||
  ((e.engine === 'mlx' || ['llamacpp', 'fastflowlm'].includes(engineFamily(text(e.engine)))) &&
    Boolean(e.latest)) ||
  (Boolean(e.active) &&
    (e.engine === 'mlx' ||
      ['llamacpp', 'foundry', 'litert', 'geniex', 'fastflowlm'].includes(engineFamily(text(e.engine)))))

/** Shared onboarding chooser; closing a runtime panel returns here without cancelling its operation. */
export function EngineChooser({
  workspace: w,
  onContinue,
  onBack,
  onLater,
}: {
  workspace: Workspace
  onContinue: () => void
  onBack: () => void
  onLater?: () => void
}) {
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [panel, setPanel] = useState('')
  const { execute } = w
  const dialog = useDialog(
    () => {
      if (!busy) onBack()
    },
    true,
    { dismissOnOutside: false }
  )
  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    void execute('engines.list')
      .then((result) => {
        if (live) setEngines(rows(record(result).engines).filter(offered))
      })
      .catch((failure) => {
        if (live) setError(describeError(failure))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [execute, retry])
  const select = async (engine: string) => {
    await execute('engines.select', { engine })
    await w.refresh()
    onContinue()
  }
  const choose = async (e: RecordValue) => {
    if (!e.active && engineFamily(text(e.engine)) === 'managed') {
      setPanel(text(e.engine))
      return
    }
    setBusy(true)
    setError('')
    try {
      if (e.active) await select(text(e.engine))
      else {
        await execute('engines.enqueue', { engine: e.engine, select: true })
        onContinue()
      }
    } catch (failure) {
      setError(describeError(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your engine"
      >
        <h1>Choose your engine</h1>
        <div className="intent-grid">
          {engines.map((e) => (
            <button key={text(e.engine)} disabled={busy || loading} onClick={() => choose(e)}>
              {engineName(text(e.engine))}
              {e.active ? ' · Installed' : ''}
            </button>
          ))}
        </div>
        {loading && <p role="status">Finding compatible engines…</p>}
        {!loading && !engines.length && !error && <p>No compatible engines available.</p>}
        {busy && <p role="status">Preparing your engine…</p>}
        {error && (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
          </>
        )}
        <button disabled={busy} onClick={onBack}>
          Back
        </button>
        {onLater && (
          <button disabled={busy} onClick={onLater}>
            Set up later
          </button>
        )}
        {panel && (
          <EngineSetup
            workspace={w}
            engine={panel}
            onClose={() => setPanel('')}
            onContinue={() => select(panel)}
          />
        )}
      </section>
    </div>
  )
}
