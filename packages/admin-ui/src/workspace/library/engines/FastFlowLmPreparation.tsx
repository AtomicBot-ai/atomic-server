import { useEffect, useState } from 'react'
import type { FastFlowLmOperation, FastFlowLmProbePlan } from '@atomic-chat/core/contracts'
import { currentFlmOperation, flmPreparationModel, type FlmPreparationView } from '@view'
import type { Workspace } from '../../useWorkspace'
import { Action } from '../../Controls'
import { describeError } from '@/services/admin-api'

export function FastFlowLmPreparation({ workspace: { execute } }: { workspace: Workspace }) {
  const [view, setView] = useState<FlmPreparationView | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    let closed = false,
      reading = false
    const read = async () => {
      if (reading) return
      reading = true
      try {
        const [probe, operations, steps] = await Promise.all([
          execute<FastFlowLmProbePlan>('fastflowlm.probe'),
          execute<FastFlowLmOperation[]>('fastflowlm.operations'),
          execute<{ operation_id: string; instructions: string }[]>('fastflowlm.host-steps'),
        ])
        const operation = currentFlmOperation(operations, probe)
        if (!closed) {
          setView({
            probe,
            operation,
            instructions: steps
              .filter((s) => s.operation_id === operation?.operation_id)
              .map((s) => s.instructions),
          })
          setError('')
        }
      } catch (e) {
        if (!closed) setError(describeError(e))
      } finally {
        reading = false
      }
    }
    void read()
    const timer = setInterval(() => void read(), 2500)
    return () => {
      closed = true
      clearInterval(timer)
    }
  }, [execute, revision])
  const model = view ? flmPreparationModel(view) : null
  const act = async (action: string) => {
    if (!view || busy) return
    setBusy(true)
    setError('')
    try {
      if (action === 'refresh') {
        refresh((n) => n + 1)
        return
      }
      const op = view.operation
      await execute(
        `fastflowlm.${action}`,
        action === 'prepare'
          ? { request_id: crypto.randomUUID() }
          : {
              id: op!.operation_id,
              ...(action !== 'stop' ? { expected_revision: op!.revision } : {}),
              ...(action === 'consent' ? { approved_plan_digest: op!.plan.plan_digest } : {}),
            }
      )
      refresh((n) => n + 1)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  const needsEngine = view?.probe.blockers.includes('engine-not-installed') && !view.operation
  const summary = needsEngine
    ? 'NPU readiness will be checked after installation.'
    : ((
        {
          'ready': 'NPU is ready',
          'blocked': 'NPU needs attention',
          'action-required': 'NPU preparation required',
          'awaiting-consent': 'Review the required changes',
          'preparing-host': 'Preparing the NPU',
          'checking': 'Checking the NPU',
          'verifying': 'Verifying the NPU',
          'failed': 'Preparation failed',
          'reboot-required': 'Restart required',
          'relogin-required': 'Sign in again to continue',
          'cancelled': 'Preparation cancelled',
        } as Record<string, string>
      )[model?.state ?? ''] ?? 'Checking the server NPU…')
  return (
    <section aria-label="FastFlowLM NPU preparation">
      <h3>NPU readiness</h3>
      <div className="engine-readiness" role="status">
        <strong>{summary}</strong>
      </div>
      {view?.operation?.state === 'awaiting-consent' && (
        <div>
          {model?.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      {view?.operation?.reason && <p role="alert">{view.operation.reason}</p>}
      {model && !needsEngine && view?.operation?.state !== 'awaiting-consent' && (
        <details className="engine-diagnostics">
          <summary>Preparation details</summary>
          {model.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </details>
      )}
      {model?.driverSetup && (
        <div>
          <h4>{model.driverSetup.title}</h4>
          {model.driverSetup.steps.map((step, i) => (
            <p key={i}>{step}</p>
          ))}
          {model.driverSetup.commands.length > 0 && (
            <pre className="overflow-x-auto whitespace-pre-wrap">
              <code>{model.driverSetup.commands.join('\n')}</code>
            </pre>
          )}
          {model.driverSetup.links.map((link) => (
            <p key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </p>
          ))}
        </div>
      )}
      {view?.operation?.state === 'awaiting-consent' && <p>Plan: {model?.digest}</p>}
      {model?.actions.map((a) => (
        <Action key={a.id} disabled={busy} onClick={() => act(a.id)}>
          {a.label}
        </Action>
      ))}
      {!view && !error && <p>Checking the server NPU…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
