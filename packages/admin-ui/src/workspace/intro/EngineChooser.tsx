import { useEffect, useState } from 'react'
import { engineFamily, engineName } from '@view'
import { describeError } from '@/services/admin-api'
import type { Workspace } from '../useWorkspace'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'
import { EngineSetup } from '../library/engines/EngineSetup'
import { ChevronRight } from 'lucide-react'
import { Action, Empty } from '../Controls'
import { DirectoryRow } from '../DirectoryRow'
import { WorkspaceBrand } from '../WorkspaceBrand'
import { FloatingDownloads } from '../library/downloads/FloatingDownloads'
import '../setup/onboarding.css'

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
  onBack?: () => void
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
      if (!busy) onBack?.()
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
    <div className="wizard-overlay first-run-overlay">
      <section
        ref={dialog}
        tabIndex={-1}
        className="wizard first-run"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your engine"
      >
        <header className="workspace-status-header desktop-topbar">
          <WorkspaceBrand />
          <FloatingDownloads workspace={w} />
        </header>
        <main className="first-run-content">
          <h1>Choose your engine</h1>
          <p className="ew-muted setup-step-description">
            The engine determines which local models you can run.
          </p>
          {loading && <Empty>Finding compatible engines…</Empty>}
          {!loading && !engines.length && !error && <Empty>No compatible engines available.</Empty>}
          {busy && <p role="status">Preparing your engine…</p>}
          {error && (
            <div className="setup-feedback">
              <p role="alert" className="ew-error">
                {error}
              </p>
              <Action onClick={() => setRetry((v) => v + 1)}>Retry</Action>
            </div>
          )}
          {engines.length > 0 && (
            <ul className="directory-list">
              {engines.map((e) => {
                const engine = text(e.engine)
                const status = e.active
                  ? engine === 'fastflowlm'
                    ? 'Build installed'
                    : 'Installed'
                  : engineFamily(engine) === 'managed'
                    ? 'Review requirements'
                    : 'Available to install'
                return (
                  <li key={engine}>
                    <DirectoryRow
                      title={engineName(engine)}
                      aria-label={e.active ? `${engineName(engine)} · ${status}` : engineName(engine)}
                      aria-describedby={e.active ? undefined : `choose-engine-${engine}-status`}
                      detail={<span id={`choose-engine-${engine}-status`}>{status}</span>}
                      disabled={busy || loading}
                      onClick={() => choose(e)}
                      trailing={<ChevronRight size={16} aria-hidden="true" />}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </main>
        <footer className={`first-run-footer${onBack ? '' : ' first-run-footer-forward'}`}>
          {onBack && (
            <Action disabled={busy} onClick={onBack}>
              Back
            </Action>
          )}
          {onLater && (
            <Action disabled={busy} onClick={onLater}>
              Set up later
            </Action>
          )}
        </footer>
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
