import { useCallback, useEffect, useRef, useState } from 'react'
import { setupFinished } from '@view'
import { useWorkspace } from '../useWorkspace'
import { record, rows } from '../types'
import { Action } from '../Controls'
import { WorkspaceBrand } from '../WorkspaceBrand'
import { EngineChooser } from './EngineChooser'

export function EngineIntro({ onContinue }: { onContinue: () => void }) {
  const w = useWorkspace()
  const [choosing, setChoosing] = useState(false)
  const { snapshot, execute } = w
  const checking = useRef(false)
  const completed = useRef(false)
  const proceed = useCallback(() => {
    if (completed.current) return
    completed.current = true
    onContinue()
  }, [onContinue])

  useEffect(() => {
    if (!snapshot || completed.current) return
    if (setupFinished(snapshot.setup)) {
      proceed()
      return
    }
    if (choosing || checking.current) return
    if (snapshot.setups.length > 0 || snapshot.downloads.some((row) => record(row).kind === 'engine')) {
      proceed()
      return
    }
    checking.current = true
    void execute('engines.list')
      .then((result) => {
        if (completed.current) return
        if (rows(record(result).engines).some((e) => e.active)) proceed()
        else setChoosing(true)
      })
      .catch(() => {
        if (!completed.current) setChoosing(true)
      })
  }, [snapshot, choosing, execute, proceed])

  if (choosing) return <EngineChooser workspace={w} onContinue={proceed} onLater={proceed} />

  return (
    <main className="wizard-overlay first-run-overlay" aria-label="Checking setup">
      <div className="wizard first-run">
        <header className="workspace-status-header desktop-topbar">
          <WorkspaceBrand />
        </header>
        <div className="first-run-content">
          {w.error ? (
            <div className="setup-feedback">
              <p role="alert" className="ew-error">
                {w.error}
              </p>
              <Action onClick={w.refresh}>Retry connection</Action>
            </div>
          ) : (
            <p role="status" className="ew-muted">
              Checking setup…
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
