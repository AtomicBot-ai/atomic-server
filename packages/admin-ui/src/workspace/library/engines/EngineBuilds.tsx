import { useCallback, useEffect, useRef, useState } from 'react'
import { engineUpdateResult } from '@view'
import type { EngineUpdateCheck } from '@view'
import { describeError } from '@/services/admin-api'
import { Action } from '../../Controls'
import { sharedRead, watchSharedRead } from '../../watch-shared-read'
import { record, rows, text } from '../../types'
import type { Execute, RecordValue } from '../../types'
import type { Workspace } from '../../useWorkspace'
import { useEngineInstall } from './use-engine-install'
import { EngineInstallProgress } from './EngineInstallProgress'
import { installationLabel } from './installation-label'
import { EngineVersions } from './EngineVersions'
import { installRuntime } from './install-runtime'

/** One installation state and primary action, backed by the server's durable engine queue. */
export function EngineBuilds({
  provider,
  execute,
  snapshot = null,
}: {
  provider: string
  execute: Execute
  snapshot?: Workspace['snapshot']
}) {
  const [engine, setEngine] = useState<RecordValue>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [check, setCheck] = useState<EngineUpdateCheck>({ phase: 'idle', message: '' })
  const installing = useEngineInstall({ execute, snapshot }, provider)
  const checking = useRef(false),
    generation = useRef(0)
  const read = useCallback(
    async (force = false) => {
      if (checking.current) return
      checking.current = true
      generation.current++
      if (force) setCheck({ phase: 'checking', message: 'Checking for updates…' })
      setError('')
      try {
        const result = await execute('engines.list', { ...(force ? { force: true } : {}) })
        const source = rows(result).find((item) => item.engine === provider)
        setEngine(source ?? {})
        if (force) setCheck(engineUpdateResult(source))
      } catch (failure) {
        if (force)
          setCheck({ phase: 'error', message: `Could not check for updates: ${describeError(failure)}` })
        else setError(describeError(failure))
      } finally {
        checking.current = false
        setLoading(false)
      }
    },
    [execute, provider]
  )
  useEffect(
    () =>
      watchSharedRead(
        async () => {
          const started = generation.current
          return { result: await sharedRead(execute, 'engines.list'), started }
        },
        ({ result, started }) => {
          if (checking.current || started !== generation.current) return
          const source = rows(result).find((item) => item.engine === provider)
          setEngine(source ?? {})
          setLoading(false)
          setError('')
          setCheck((current) => (current.phase === 'available' ? engineUpdateResult(source) : current))
        },
        (failure) => {
          setError(describeError(failure))
          setLoading(false)
        }
      ),
    [execute, provider]
  )
  const previous = useRef(installing.refreshKey)
  useEffect(() => {
    if (previous.current === installing.refreshKey) return
    previous.current = installing.refreshKey
    void read()
  }, [installing.refreshKey, read])
  const active = record(engine.active)
  const installed = Boolean(active.version || rows(engine.builds).length)
  const offered = check.phase === 'available'
  const special = provider === 'foundry-local' || provider === 'litert-lm'
  const busy = installing.busy || check.phase === 'checking'
  const install = async () => {
    setCheck({ phase: 'idle', message: '' })
    if (special && !installing.hasQueuedFailure)
      await installing.run((taskId, preparing) => installRuntime(execute, provider, taskId, preparing), true)
    else await installing.enqueue()
  }
  const label = installing.runtimeBusy
    ? installationLabel(installing.installation) || 'Working…'
    : installing.error
      ? 'Retry installation'
      : installed
        ? 'Install latest build'
        : 'Install engine'
  return (
    <section className="engine-builds" aria-label="Engine builds">
      <div className="engine-runtime-heading">
        <div>
          <h3>Installation</h3>
          <p className="engine-runtime-summary">
            {loading
              ? 'Checking installation…'
              : installing.runtimeBusy
                ? 'Installation in progress'
                : installed
                  ? 'Installed'
                  : error
                    ? 'Installation status unavailable'
                    : 'Not installed'}
          </p>
          {Boolean(active.version) && (
            <p className="ew-muted">
              {text(active.version)}
              {active.variant ? ` · ${text(active.variant)}` : ''}
            </p>
          )}
        </div>
        <div className="ew-actions">
          {!engine.engine && error && <Action onClick={() => read()}>Retry check</Action>}
          {Boolean(engine.engine) &&
            engine.kind !== 'managed' &&
            (!installed || offered || installing.error || installing.runtimeBusy) && (
              <Action primary disabled={busy || loading} onClick={install}>
                {label}
              </Action>
            )}
          {installed && !offered && !installing.error && !installing.runtimeBusy && (
            <Action disabled={busy} onClick={() => read(true)}>
              {check.phase === 'checking' ? 'Checking…' : 'Check for updates'}
            </Action>
          )}
        </div>
      </div>
      <EngineInstallProgress installation={installing.installation} downloads={installing.downloads} />
      {(installing.error || error) && (
        <p role="alert" className="engine-feedback error">
          {installing.error || error}
        </p>
      )}
      {!installing.busy && check.message && (
        <p role={check.phase === 'error' ? 'alert' : 'status'} className="engine-feedback">
          {check.message}
        </p>
      )}
      {Boolean(engine.source_error) && !error && check.phase === 'idle' && (
        <p role="alert">{text(engine.source_error)}</p>
      )}
      <EngineVersions
        provider={provider}
        builds={rows(engine.builds)}
        activeChoice={engine.active_choice}
        execute={execute}
        busy={busy}
        onChanged={read}
      />
    </section>
  )
}
