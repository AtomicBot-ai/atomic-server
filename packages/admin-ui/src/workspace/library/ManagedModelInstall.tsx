import { useEffect, useState } from 'react'
import type { ManagedModelPlan, ManagedVerdict } from '@contract'
import { engineName, formatSize, verdictLine } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'

/**
 * A checkpoint for the managed engines (spec managed-models-server), as `atc models check|pull --engine`:
 * the core's verdict of every managed engine with its reason and numbers; Download only through an
 * installed engine that takes it, after the plan; otherwise "Install <engine>" for one that would.
 */
export function ManagedModelInstall({
  workspace: w,
  repository,
  onClose,
  onStarted,
  onInstallEngine,
}: {
  workspace: Workspace
  repository: string
  onClose: () => void
  onStarted?: (id: string) => void
  onInstallEngine: (engine: string) => void
}) {
  const dialog = useDialog(onClose)
  const [verdicts, setVerdicts] = useState<ManagedVerdict[] | null>(null)
  const [engine, setEngine] = useState('')
  const [plan, setPlan] = useState<ManagedModelPlan | null>(null)
  const [error, setError] = useState('')
  const { execute } = w
  useEffect(() => {
    let active = true
    void execute<{ verdicts: ManagedVerdict[] }>('models.check', { repository })
      .then((r) => active && setVerdicts(r.verdicts))
      .catch((e) => active && setError(describeError(e)))
    return () => {
      active = false
    }
  }, [execute, repository])
  const takes = (verdicts ?? []).filter((v) => v.compatibility?.verdict.ok)
  const usable = takes.filter((v) => v.installed).map((v) => v.engine)
  const would = takes.filter((v) => !v.installed).map((v) => v.engine)
  const chosen = usable.includes(engine) ? engine : (usable[0] ?? '')
  const run = (work: () => Promise<void>) => work().catch((e) => setError(describeError(e)))
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${repository}`}
      >
        <div className="panel-heading">
          <h2>{repository}</h2>
          <button className="ew-button" onClick={onClose}>
            Close
          </button>
        </div>
        {!verdicts && !error && <p className="ew-muted">Asking the core which engines run it here…</p>}
        {(verdicts ?? []).map((v) => (
          <p key={v.engine}>{verdictLine(v)}</p>
        ))}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {verdicts && !usable.length && would.length > 0 && (
          <p className="ew-muted">No installed engine takes it; install one that would, then download it.</p>
        )}
        {!plan ? (
          <div className="ew-actions">
            {usable.length > 1 && (
              <Field label="Engine">
                <select aria-label="Engine" value={chosen} onChange={(e) => setEngine(e.target.value)}>
                  {usable.map((e) => (
                    <option key={e} value={e}>
                      {engineName(e)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {chosen && (
              <Action
                primary
                onClick={() =>
                  run(async () =>
                    setPlan(await execute<ManagedModelPlan>('managed.plan', { repository, engine: chosen }))
                  )
                }
              >
                Review download
              </Action>
            )}
            {!usable.length &&
              would.map((e) => (
                <Action key={e} onClick={() => onInstallEngine(e)}>
                  Install {engineName(e)}
                </Action>
              ))}
          </div>
        ) : (
          <>
            <div className="plan-facts">
              <div>
                <span>Download</span>
                <strong>{formatSize(plan.download_bytes)}</strong>
              </div>
              <div>
                <span>Available disk</span>
                <strong>{plan.free_bytes === null ? 'unknown' : formatSize(plan.free_bytes)}</strong>
              </div>
              <div>
                <span>Into the shared store</span>
                <strong>{plan.root}</strong>
              </div>
            </div>
            {plan.blockers.length > 0 && (
              <ul role="alert">
                {plan.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <div className="ew-actions">
              <Action onClick={() => setPlan(null)}>Back</Action>
              <Action
                primary
                disabled={plan.blockers.length > 0}
                onClick={() =>
                  run(async () => {
                    const id = `admin-${crypto.randomUUID()}`
                    await execute('managed.install', { request_id: id, plan_digest: plan.digest })
                    onStarted?.(id)
                    onClose()
                  })
                }
              >
                Download
              </Action>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
