import { useCallback, useEffect, useState } from 'react'
import type { LiteRtAcceleratorsView } from '@contract'
import { liteRtAcceleratorLines } from '@view'
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
 * LiteRT-LM's engine (spec litert-lm-server, «LiteRT-LM в TUI и admin»): the active build and the
 * accelerator the core offers here — `openvino` on an Intel NPU, with Prepare and its step while the
 * server prepares (read again at every snapshot while a prepare runs); nothing to prepare on Linux and
 * macOS. Install and Update build prepare openvino after them where it is offered, as `atc engines
 * install litert-lm` does. Closing it stops nothing.
 */
export function LiteRtLm({
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
  const [view, setView] = useState<LiteRtAcceleratorsView | null>(null)
  const {
    busy,
    actionError,
    hasQueuedFailure,
    enqueue,
    error: installError,
    installation,
    refreshKey,
    run: act,
  } = useEngineInstall(w, 'litert-lm')
  const [error, setError] = useState('')
  const { execute } = w
  const read = useCallback(async () => {
    try {
      const next = await execute<LiteRtAcceleratorsView>('litert.accelerators')
      setError('')
      setView(next)
      return next
    } catch (e) {
      setError(describeError(e))
      return null
    }
  }, [execute])
  const tick = view?.preparing ? w.snapshot?.captured_at : 0
  useEffect(() => {
    void read()
  }, [read, tick, refreshKey])
  const install = () =>
    hasQueuedFailure
      ? enqueue()
      : act(async (taskId, preparing) => {
          setError('')
          await installRuntime(execute, 'litert-lm', taskId, preparing)
        }, true)
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? undefined : 'ew-modal'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="LiteRT-LM"
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>LiteRT-LM</h2>
            <button className="ew-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {!view && !error && <p className="ew-muted">Reading the accelerator…</p>}
        <div className="panel-heading">
          <h3>Hardware acceleration</h3>
          <Action disabled={busy} onClick={() => act(read)}>
            Refresh hardware
          </Action>
        </div>
        {view && !view.installed && (
          <p className="ew-muted">Device support will be checked after installation.</p>
        )}
        {view?.installed && (
          <>
            {view.accelerators.map((a) => (
              <div className="accelerator-row" key={a.name}>
                <div>
                  <strong>{a.name === 'openvino' ? 'OpenVINO NPU' : a.name}</strong>
                  <small>
                    {a.prepared ? 'Ready' : 'Needs preparation'}
                    {view.npu ? ` · ${view.npu}` : ''}
                  </small>
                  {a.reason && <p>{a.reason}</p>}
                </div>
                {!a.prepared && (
                  <Action
                    disabled={busy || view.preparing}
                    onClick={() => act(() => execute('litert.prepare', { accelerators: [a.name] }))}
                  >
                    Prepare {a.name}
                  </Action>
                )}
              </div>
            ))}
            {!view.accelerators.length && !view.error && (
              <p className="ew-muted">
                No additional accelerator setup is required. Choose a supported CPU or GPU variant in the
                catalog.
              </p>
            )}
            <details className="engine-diagnostics">
              <summary>Hardware details</summary>
              {liteRtAcceleratorLines(view).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </details>
          </>
        )}
        {view?.preparing && (
          <div role="status">
            <p>Preparing accelerators…</p>
            {view.steps.map((step) => (
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
              {busy ? installationLabel(installation) || 'Working…' : 'Install LiteRT-LM'}
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
