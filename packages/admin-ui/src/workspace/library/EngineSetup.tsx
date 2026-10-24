import { useCallback, useEffect, useState } from 'react'
import type { ManagedEngineState, ManagedInstallResult } from '@contract'
import {
  engineApproval,
  engineName,
  engineRefreshKey,
  engineView,
  failureLines,
  formatSize,
  liveEngineState,
  operationView,
  otherOperationLine,
  planBlocked,
  planLines,
  rebootLines,
  reloginLines,
  removalLines,
  updateLine,
} from '@view'
import { describeError } from '@/services/admin-api'
import { useStatusStore } from '@/stores/status-store'
import { Action, Copy } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'

const requestId = () => `admin-${crypto.randomUUID()}`

/**
 * A managed engine's setup, update and removal (design D17), with the words of `atc engines
 * install|rm|status` from the shared view: the core's state (`engines.plan`) joined with the 2.5 s
 * snapshot, read again whenever the live operation moves on. Agree carries the digest of the plan on
 * screen, and nothing while the core waits for consent to a plan not shown. Closing it stops nothing.
 */
export function EngineSetup({
  workspace: w,
  engine,
  onClose,
  embedded = false,
}: {
  workspace: Workspace
  engine: string
  onClose: () => void
  embedded?: boolean
}) {
  const dialog = useDialog(onClose, !embedded)
  const launch = useStatusStore((s) => s.status?.launch) ?? 'terminal'
  const [state, setState] = useState<ManagedEngineState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState(false)
  const [keepModels, setKeepModels] = useState(false)
  // An update the core offers: its plan, agreed to before the reinstall removes the installed image.
  const [offer, setOffer] = useState<Extract<ManagedInstallResult, { status: 'update' }> | null>(null)
  const { execute } = w
  const key = engineRefreshKey(engine, w.snapshot)
  const read = useCallback(async () => {
    try {
      setState(await execute<ManagedEngineState>('engines.plan', { engine }))
    } catch (e) {
      setError(describeError(e))
    }
  }, [execute, engine])
  useEffect(() => {
    void read()
  }, [read, key])
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'MANAGED_PLAN_CHANGED')
        setNotice('The plan changed since it was shown: review it and agree again.')
      else setError(describeError(e))
    } finally {
      setBusy(false)
      await read()
    }
  }
  const merged = state ? liveEngineState(state, w.snapshot) : null
  const view = merged ? engineView(merged) : null
  const approval = merged ? engineApproval(merged) : null
  const op = view?.operation ?? null
  const step = op ? w.snapshot?.host_steps?.find((h) => h.operation_id === op.operation_id) : undefined
  const progress = op ? operationView(op) : null
  const lines = (list: string[]) => list.map((line, i) => <p key={i}>{line}</p>)
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? undefined : 'ew-modal'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label={`${engineName(engine)} setup`}
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>{engineName(engine)}</h2>
            <button className="ew-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {!view && <p className="ew-muted">{error ? '' : 'Reading the core’s plan…'}</p>}
        {view && <p className="ew-muted">{view.summary}</p>}
        {merged && view && (
          <div className="engine-setup">
            {(view.kind === 'installable' || view.kind === 'blocked' || view.kind === 'unsupported') &&
              lines(planLines(merged))}
            {view.kind === 'installable' && merged.other_operation && (
              <p className="ew-muted">{otherOperationLine(merged.other_operation, engine)}</p>
            )}
            {view.kind === 'consent' &&
              (op?.kind === 'remove' ? (
                lines(removalLines(merged))
              ) : approval ? (
                lines(planLines(merged))
              ) : (
                <p className="ew-muted">
                  The plan changed since it was read: reading the new one to ask again…
                </p>
              ))}
            {progress && (view.kind === 'operation' || view.kind === 'host-step') && (
              <>
                {progress.total ? (
                  <>
                    <progress aria-label="Image download" value={progress.done ?? 0} max={progress.total} />
                    <small>
                      {formatSize(progress.done)} of {formatSize(progress.total)}
                    </small>
                  </>
                ) : null}
              </>
            )}
            {view.kind === 'host-step' && step?.instructions && (
              <div className="request-example">
                <strong>Run this as administrator; the setup moves on by itself once it ran:</strong>
                <pre>{step.instructions}</pre>
                <Copy value={step.instructions} label="Copy command" />
              </div>
            )}
            {view.kind === 'relogin' && op && lines(reloginLines(launch, op.operation_id))}
            {view.kind === 'reboot' && op && lines(rebootLines(op.operation_id))}
            {view.kind === 'failed' && op && (
              <div role="alert" className="inline-error">
                {failureLines(op).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
            {view.kind === 'failed' && merged.other_operation && (
              <p className="ew-muted">{otherOperationLine(merged.other_operation, engine)}</p>
            )}
            {view.kind === 'update' && offer && (
              <>
                <p className="notice">{updateLine(engine, offer.from, offer.target)}</p>
                {lines(planLines(offer.state))}
              </>
            )}
            {(view.kind === 'ready' || view.kind === 'update') && removing && (
              <>
                {lines(removalLines(merged, keepModels))}
                <label>
                  <input
                    type="checkbox"
                    checked={keepModels}
                    onChange={(e) => setKeepModels(e.target.checked)}
                  />{' '}
                  Keep models
                </label>
              </>
            )}
          </div>
        )}
        {notice && <p className="ew-muted">{notice}</p>}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="ew-actions">
          {approval && view && (view.kind === 'installable' || view.kind === 'consent') && (
            <Action
              primary
              disabled={busy}
              onClick={() =>
                act(() =>
                  approval.via === 'resume'
                    ? execute('engines.resume', {
                        operation_id: op!.operation_id,
                        approved_plan_digest: approval.digest,
                      })
                    : execute('engines.operate', {
                        engine,
                        kind: 'setup',
                        request_id: requestId(),
                        approved_plan_digest: approval.digest,
                      })
                )
              }
            >
              {view.kind === 'installable' ? 'Agree and install' : 'Agree'}
            </Action>
          )}
          {op && ['operation', 'host-step', 'consent'].includes(view?.kind ?? '') && (
            <Action
              disabled={busy}
              onClick={() => act(() => execute('engines.cancel', { operation_id: op.operation_id }))}
            >
              Cancel operation
            </Action>
          )}
          {/* The core changes one managed engine at a time: a Retry now would only wait behind it. */}
          {op &&
            ['relogin', 'reboot', 'failed'].includes(view?.kind ?? '') &&
            !(view?.kind === 'failed' && merged?.other_operation) && (
              <Action
                disabled={busy}
                onClick={() => act(() => execute('engines.resume', { operation_id: op.operation_id }))}
              >
                {view?.kind === 'failed' ? 'Retry' : 'Continue'}
              </Action>
            )}
          {view?.kind === 'update' && !removing && !offer && (
            <Action
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const answer = await execute<ManagedInstallResult>('engines.install', {
                    engine,
                    request: { request_id: requestId() },
                  })
                  if (answer.status === 'update') setOffer(answer)
                })
              }
            >
              Update
            </Action>
          )}
          {/* A release this machine cannot run is never agreed to: the reinstall removes the working image first. */}
          {view?.kind === 'update' && offer?.state.plan && !planBlocked(offer.state.plan) && (
            <>
              <Action
                primary
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await execute('engines.install', {
                      engine,
                      request: { request_id: requestId(), approved_update: offer.target },
                    })
                    setOffer(null)
                  })
                }
              >
                Agree and update
              </Action>
              <Action onClick={() => setOffer(null)}>Back</Action>
            </>
          )}
          {(view?.kind === 'ready' || view?.kind === 'update') &&
            (removing ? (
              <>
                <Action
                  danger
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await execute('engines.operate', {
                        engine,
                        kind: 'remove',
                        request_id: requestId(),
                        retain_models: keepModels,
                      })
                      setRemoving(false)
                    })
                  }
                >
                  Remove
                </Action>
                <Action onClick={() => setRemoving(false)}>Back</Action>
              </>
            ) : (
              <Action onClick={() => setRemoving(true)}>Remove…</Action>
            ))}
        </div>
      </section>
    </div>
  )
}
