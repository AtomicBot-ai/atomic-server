import { useEffect, useRef, useState } from 'react'
import { engineName, engineUpdateResult } from '@view'
import type { EngineUpdateCheck } from '@view'
import { describeError } from '@/services/admin-api'
import { Action } from '../Controls'
import { useConfirmation } from '../use-confirmation'
import { watchSharedRead } from '../watch-shared-read'
import { record, rows, text } from '../types'
import type { Execute, RecordValue } from '../types'

/** Builds and updates live alongside the engine's settings in the same scrollable dialog. */
export function EngineBuilds({ provider, execute }: { provider: string; execute: Execute }) {
  const [engine, setEngine] = useState<RecordValue>({})
  const [error, setError] = useState('')
  const [check, setCheck] = useState<EngineUpdateCheck>({ phase: 'idle', message: '' })
  const checking = useRef(false)
  const generation = useRef(0)
  const { ask, confirmation, waiting } = useConfirmation()
  const read = async (force = false) => {
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
    }
  }
  useEffect(
    () =>
      watchSharedRead(
        async () => {
          const started = generation.current
          return { result: await execute('engines.list'), started }
        },
        ({ result, started }) => {
          if (checking.current || started !== generation.current) return
          const source = rows(result).find((item) => item.engine === provider)
          setEngine(source ?? {})
          setCheck((current) => (current.phase === 'available' ? engineUpdateResult(source) : current))
        },
        (failure) => setError(String(failure))
      ),
    [execute, provider]
  )
  const managed = engine.kind === 'managed'
  const canInstall = !managed && provider !== 'foundry-local'
  const offered = canInstall && Boolean(engine.active) && check.phase === 'available'
  const install = async () => {
    await execute('engines.enqueue', { engine: provider })
    setCheck({ phase: 'idle', message: 'Download queued.' })
    await read()
  }
  return (
    <section className="engine-builds" aria-label="Engine builds">
      <div className="panel-heading">
        <h3>Installed builds</h3>
        <Action
          primary={offered}
          disabled={waiting || check.phase === 'checking'}
          onClick={offered ? install : () => read(true)}
        >
          {offered ? 'Install latest build' : check.phase === 'checking' ? 'Checking…' : 'Check for updates'}
        </Action>
      </div>
      {check.message && (
        <p
          role={check.phase === 'error' ? 'alert' : 'status'}
          className={check.phase === 'error' ? 'ew-error' : 'ew-muted'}
        >
          {check.message}
        </p>
      )}
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
      {Boolean(engine.source_error) && check.phase === 'idle' && (
        <p role="alert">{text(engine.source_error)}</p>
      )}
      {!rows(engine.builds).length && (
        <p className="ew-muted">
          {engine.active ? `Active: ${text(record(engine.active).version)}` : 'Not installed'}
        </p>
      )}
      {rows(engine.builds).map((build) => (
        <div className="installed-row" key={`${text(build.version)}-${text(build.variant)}`}>
          <div>
            <strong>{text(build.version)}</strong>
            <small>
              {text(build.variant)}
              {build.in_use ? ' · In use' : ''}
            </small>
          </div>
          <div className="ew-actions">
            <Action
              disabled={waiting || Boolean(build.active) || engine.active_choice !== 'client'}
              onClick={async () => {
                await execute('engines.activate', {
                  engine: provider,
                  version: build.version,
                  variant: build.variant,
                })
                await read()
              }}
            >
              {build.active ? 'Active' : 'Activate'}
            </Action>
            <Action
              disabled={!build.removable || waiting}
              title={text(build.not_removable_reason, '')}
              onClick={() =>
                ask({
                  title: 'Remove engine build?',
                  actionLabel: 'Remove build',
                  danger: true,
                  children: (
                    <p>
                      {engineName(provider)} · {text(build.version)} · {text(build.variant)}
                    </p>
                  ),
                  onConfirm: async () => {
                    await execute('engines.remove', {
                      engine: provider,
                      version: build.version,
                      variant: build.variant,
                    })
                    await read()
                  },
                })
              }
            >
              Remove
            </Action>
          </div>
        </div>
      ))}
      {canInstall && Boolean(engine.engine) && !engine.active && (
        <Action disabled={waiting || check.phase === 'checking'} onClick={install}>
          Install engine
        </Action>
      )}
      {confirmation}
    </section>
  )
}
