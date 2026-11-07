// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: managed engine verdicts and direct server download.
import { useEffect, useRef, useState } from 'react'
import type { ManagedModelPlan, ManagedVerdict } from '@contract'
import { engineName, formatSize } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../../Controls'
import type { Workspace } from '../../useWorkspace'
import { ModelInstallFrame } from './ModelInstallFrame'
import { ManagedCompatibility } from './ManagedCompatibility'
import './runtime-model.css'

export function ManagedModelInstall({
  workspace: w,
  repository,
  expectedEngine,
  onClose,
  onStarted,
  onInstallEngine,
  embedded = false,
  revision = 0,
}: {
  workspace: Workspace
  repository: string
  expectedEngine?: string
  onClose: () => void
  onStarted?: (id: string) => void | Promise<void>
  onInstallEngine: (engine: string) => void
  embedded?: boolean
  revision?: number
}) {
  const [verdicts, setVerdicts] = useState<ManagedVerdict[] | null>(null)
  const [engine, setEngine] = useState('')
  const [plan, setPlan] = useState<ManagedModelPlan | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef<{ digest: string; id: string } | null>(null)
  const { execute } = w
  useEffect(() => {
    let active = true
    setVerdicts(null)
    setPlan(null)
    setError('')
    void execute<{ verdicts: ManagedVerdict[] }>('models.check', { repository })
      .then((r) => active && setVerdicts(r.verdicts))
      .catch((e) => active && setError(describeError(e)))
    return () => {
      active = false
    }
  }, [execute, repository, revision, retry])
  const takes = (verdicts ?? []).filter((v) => v.compatibility?.verdict.ok)
  const usable = takes.filter((v) => v.installed).map((v) => v.engine)
  const would = takes
    .filter((v) => !v.installed && (!expectedEngine || v.engine === expectedEngine))
    .map((v) => v.engine)
  const chosen = expectedEngine
    ? usable.includes(expectedEngine)
      ? expectedEngine
      : ''
    : usable.includes(engine)
      ? engine
      : (usable[0] ?? '')
  const download = async () => {
    if (!chosen || pending) return
    setPending(true)
    setError('')
    setPlan(null)
    try {
      const next = await execute<ManagedModelPlan>('managed.plan', { repository, engine: chosen })
      setPlan(next)
      if (next.blockers.length) return
      if (request.current?.digest !== next.digest)
        request.current = { digest: next.digest, id: `admin-${crypto.randomUUID()}` }
      const id = request.current.id
      await execute('managed.install', { request_id: id, plan_digest: next.digest })
      await onStarted?.(id)
      onClose()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <ModelInstallFrame
      embedded={embedded}
      pending={pending}
      title={repository}
      onClose={() => {
        if (!pending) onClose()
      }}
    >
      {!verdicts && !error && (
        <p className="ew-muted" role="status">
          Checking compatibility…
        </p>
      )}
      {verdicts && <ManagedCompatibility verdicts={verdicts} />}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {verdicts && expectedEngine && !chosen && (
        <p role="alert">
          {engineName(expectedEngine)} is not ready to run this model. Review its compatibility above or
          choose another model.
        </p>
      )}
      {!verdicts && error && (
        <Action onClick={() => setRetry((v) => v + 1)}>Retry compatibility check</Action>
      )}
      {verdicts && !usable.length && would.length > 0 && (
        <p className="ew-muted">Install an engine to download this model.</p>
      )}
      {plan && <p>{formatSize(plan.download_bytes)}</p>}
      {Boolean(plan?.blockers.length) && (
        <ul role="alert">
          {plan!.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      <div className="ew-actions runtime-model-actions">
        {verdicts && expectedEngine && !chosen && <Action onClick={onClose}>Choose another model</Action>}
        {!expectedEngine && usable.length > 1 && (
          <Field label="Engine">
            <select
              aria-label="Engine"
              value={chosen}
              disabled={pending}
              onChange={(e) => {
                setEngine(e.target.value)
                setPlan(null)
                setError('')
              }}
            >
              {usable.map((id) => (
                <option key={id} value={id}>
                  {engineName(id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {chosen && (
          <Action primary disabled={pending} onClick={download}>
            {pending ? 'Preparing download…' : 'Download'}
          </Action>
        )}
        {!chosen &&
          would.map((id) => (
            <Action key={id} onClick={() => onInstallEngine(id)}>
              Install {engineName(id)}
            </Action>
          ))}
      </div>
    </ModelInstallFrame>
  )
}
