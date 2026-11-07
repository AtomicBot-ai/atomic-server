import { useCallback, useEffect, useState } from 'react'
import type { FoundryAcceleratorsView } from '@contract'
import { acceleratorLabel, acceleratorLines } from '@view'
import { describeError } from '@/services/admin-api'
import { EngineInstallProgress } from './EngineInstallProgress'
import { installationLabel } from './installation-label'
import { installRuntime } from './install-runtime'
import { useEngineInstall } from './use-engine-install'
import { Action } from '../../Controls'
import { useDialog } from '../../useDialog'
import type { Workspace } from '../../useWorkspace'
import './engine-settings.css'

/**
 * Foundry Local's accelerators (spec foundry-local-server): what the library found, each one's Prepare,
 * and each accelerator's step while the server prepares (`foundry.accelerators`' `steps`, read again at
 * every snapshot while a prepare runs); Install when the engine is absent and Update build when it is
 * there, each preparing after it as `atc engines install foundry-local` does. Closing it stops nothing.
 */
export function FoundryLocal({
  workspace: w,
  onClose,
  embedded = false,
  hardwareOnly = false,
}: {
  workspace: Workspace
  onClose: () => void
  embedded?: boolean
  hardwareOnly?: boolean
}) {
  const dialog = useDialog(onClose, !embedded)
  const [view, setView] = useState<FoundryAcceleratorsView | null>(null)
  const {
    busy,
    actionError,
    hasQueuedFailure,
    enqueue,
    error: installError,
    installation,
    refreshKey,
    run: act,
  } = useEngineInstall(w, 'foundry-local')
  const [error, setError] = useState('')
  const { execute } = w
  const read = useCallback(async () => {
    try {
      setView(await execute<FoundryAcceleratorsView>('foundry.accelerators'))
      setError('')
    } catch (e) {
      setError(describeError(e))
    }
  }, [execute])
  const tick = view?.preparing ? w.snapshot?.captured_at : 0
  useEffect(() => {
    void read()
  }, [read, tick, refreshKey])
  // An update installs a new build, which registers nothing yet: prepare after it, as the install does.
  const install = () =>
    hasQueuedFailure
      ? enqueue()
      : act(async (taskId, preparing) => {
          setError('')
          await installRuntime(execute, 'foundry-local', taskId, preparing)
        }, true)
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? undefined : 'ew-modal'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="Foundry Local"
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>Foundry Local</h2>
            <button className="ew-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {!view && !error && <p className="ew-muted">Reading the accelerators…</p>}
        <div className="panel-heading">
          <h3>Hardware acceleration</h3>
          <Action
            disabled={busy}
            onClick={() =>
              act(() =>
                execute<FoundryAcceleratorsView>('foundry.accelerators', { force: true }).then(setView)
              )
            }
          >
            Refresh hardware
          </Action>
        </div>
        {view && !view.installed && (
          <p className="ew-muted">GPU and NPU support will be checked after installation.</p>
        )}
        {view?.installed && (
          <div className="accelerator-list">
            {view.accelerators
              .filter((a) => a.execution_provider !== null)
              .map((a) => (
                <div className="accelerator-row" key={a.name}>
                  <div>
                    <strong>{acceleratorLabel(a)}</strong>
                    <small>{a.prepared ? 'Ready' : 'Needs preparation'}</small>
                    {a.reason && <p>{a.reason}</p>}
                  </div>
                  {!a.prepared && (
                    <Action
                      disabled={busy || view.preparing}
                      onClick={() => act(() => execute('foundry.prepare', { accelerators: [a.name] }))}
                    >
                      Prepare {acceleratorLabel(a)}
                    </Action>
                  )}
                </div>
              ))}
            {!view.accelerators.some((a) => a.execution_provider !== null && a.device !== 'cpu') &&
              !view.error && (
                <p className="ew-muted">
                  CPU is available. No additional accelerator was offered by Foundry Local.
                </p>
              )}
          </div>
        )}
        {view?.preparing && (
          <div role="status">
            <p>Preparing accelerators…</p>
            {view.steps?.map((step) => (
              <p key={step.accelerator}>
                {step.accelerator}: {step.stage}
                {step.fraction !== null && step.stage === 'downloading'
                  ? ` ${Math.round(step.fraction * 100)}%`
                  : ''}
                {step.reason ? ` — ${step.reason}` : ''}
              </p>
            ))}
          </div>
        )}
        {(view?.error || view?.last_error) && <p role="alert">{view.error || view.last_error}</p>}
        {view?.installed && (
          <details className="engine-diagnostics">
            <summary>Hardware details</summary>
            {acceleratorLines(view).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </details>
        )}
        {!hardwareOnly && (
          <EngineInstallProgress installation={installation} downloads={w.snapshot?.downloads ?? []} />
        )}
        {((!hardwareOnly && installError) || actionError || error) && (
          <p role="alert" className="inline-error">
            {(!hardwareOnly && installError) || actionError || error}
          </p>
        )}
        <div className="ew-actions">
          {!hardwareOnly && view && !view.installed && (
            <Action primary disabled={busy} onClick={install}>
              {busy ? installationLabel(installation) || 'Working…' : 'Install Foundry Local'}
            </Action>
          )}
          {!hardwareOnly && view?.installed && !view.preparing && (
            <Action disabled={busy} onClick={install}>
              {busy ? installationLabel(installation) || 'Working…' : 'Update build'}
            </Action>
          )}
        </div>
      </section>
    </div>
  )
}
