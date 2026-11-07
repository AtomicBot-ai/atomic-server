import { useState } from 'react'
import type { ManagedInstallResult } from '@contract'
import {
  engineApproval,
  engineName,
  engineView,
  failureLines,
  formatSize,
  liveEngineState,
  operationView,
  otherOperationLine,
  planBlocked,
  rebootLines,
  reloginLines,
  removalLines,
  updateLine,
} from '@view'
import { useStatusStore } from '@/stores/status-store'
import { Action, Copy } from '../../Controls'
import { EnginePlan } from './EnginePlan'
import { useManagedEngine } from './use-managed-engine'
import './engine-settings.css'
import { useDialog } from '../../useDialog'
import type { Workspace } from '../../useWorkspace'

const requestId = () => `admin-${crypto.randomUUID()}`
/**
 * Managed engine lifecycle (D17): join engines.plan with the live snapshot and approve only the
 * displayed plan digest. Closing stops no operation; only saving onboarding's selection holds it open.
 */
export function EngineSetup({
  workspace: w,
  engine,
  onClose,
  embedded = false,
  onContinue,
}: {
  workspace: Workspace
  engine: string
  onClose: () => void
  embedded?: boolean
  onContinue?: () => Promise<void>
}) {
  const { state, busy, error, notice, continuing, act } = useManagedEngine(w, engine)
  const close = () => {
    if (!continuing) onClose()
  }
  const dialog = useDialog(close, !embedded)
  const launch = useStatusStore((s) => s.status?.launch) ?? 'terminal'
  const [removing, setRemoving] = useState(false)
  const [keepModels, setKeepModels] = useState(false)
  // An update the core offers: its plan, agreed to before the reinstall removes the installed image.
  const [offer, setOffer] = useState<Extract<ManagedInstallResult, { status: 'update' }> | null>(null)
  const { execute } = w
  const merged = state ? liveEngineState(state, w.snapshot) : null
  const view = merged ? engineView(merged) : null
  const approval = merged ? engineApproval(merged) : null
  const op = view?.operation ?? null
  const step = op ? w.snapshot?.host_steps?.find((h) => h.operation_id === op.operation_id) : undefined
  const progress = op ? operationView(op) : null
  const lines = (list: string[]) => (
    <div className="engine-plan-lines">
      {list.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  )
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? 'engine-managed-content' : 'ew-modal engine-managed-content'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label={`${engineName(engine)} setup`}
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>{engineName(engine)}</h2>
            <button className="ew-button" disabled={continuing} onClick={close}>
              Close
            </button>
          </div>
        )}
        {!view && <p className="ew-muted">{error ? '' : 'Reading the core’s plan…'}</p>}
        <h3>Installation</h3>
        {view && <p className="engine-runtime-summary">{view.summary}</p>}
        {busy && (
          <p role="status" className="engine-feedback">
            Applying request…
          </p>
        )}
        {merged && view && (
          <div className="engine-setup">
            {(view.kind === 'installable' || view.kind === 'blocked' || view.kind === 'unsupported') && (
              <EnginePlan state={merged} />
            )}
            {view.kind === 'installable' && merged.other_operation && (
              <p className="ew-muted">{otherOperationLine(merged.other_operation, engine)}</p>
            )}
            {view.kind === 'consent' &&
              (op?.kind === 'remove' ? (
                lines(removalLines(merged))
              ) : approval ? (
                <EnginePlan state={merged} />
              ) : (
                <p className="ew-muted">
                  The plan changed since it was read: reading the new one to ask again…
                </p>
              ))}
            {progress?.total && (view.kind === 'operation' || view.kind === 'host-step') ? (
              <>
                <progress aria-label="Image download" value={progress.done ?? 0} max={progress.total} />
                <small>
                  {formatSize(progress.done)} of {formatSize(progress.total)}
                </small>
              </>
            ) : null}
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
                <EnginePlan state={offer.state} />
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
          {onContinue && (view?.kind === 'ready' || view?.kind === 'update') && !removing && !offer && (
            <Action primary disabled={busy} onClick={() => act(onContinue, true)}>
              Choose models
            </Action>
          )}
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
              {busy ? 'Applying request…' : view.kind === 'installable' ? 'Agree and install' : 'Agree'}
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
              <Action disabled={busy} onClick={() => setOffer(null)}>
                Back
              </Action>
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
                <Action disabled={busy} onClick={() => setRemoving(false)}>
                  Back
                </Action>
              </>
            ) : (
              <Action disabled={busy} onClick={() => setRemoving(true)}>
                Remove…
              </Action>
            ))}
        </div>
      </section>
    </div>
  )
}
