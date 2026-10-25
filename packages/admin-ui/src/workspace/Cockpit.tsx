import { useState } from 'react'
import { useConfirmation } from './use-confirmation'
import type { Workspace } from './useWorkspace'
import { HostStepBanner } from './HostStepBanner'
import { loadStageText } from '@view'
import type { Page } from './types'
import { Action, JsonResult } from './Controls'
import { Eye } from './Eye'
import type { EyeState } from './Eye'
import { text } from './types'

export function Cockpit({
  workspace: w,
  navigate,
}: {
  workspace: Workspace
  navigate: (page: Page) => void
}) {
  const { ask, confirmation, waiting } = useConfirmation()
  const [ping, setPing] = useState<unknown>()
  const s = w.snapshot
  const state: EyeState = w.error
    ? 'disconnected'
    : w.pending.some((op) => ['api.start', 'api.restart', 'models.load'].includes(op))
      ? 'starting'
      : s?.eye === 'offline'
        ? 'stopped'
        : (s?.eye ?? 'starting')
  const metric = (value: number | null | undefined, unit = '') =>
    value === null || value === undefined ? '—' : `${Math.round(value * 10) / 10}${unit}`
  return (
    <header className="ew-cockpit" aria-label="Server status">
      {confirmation}
      <Eye state={state} />
      <div className="cockpit-main">
        <div className="brand-row">
          <strong className="ew-brand">ATOMIC SERVER</strong>
          <span className={`state-label state-${state}`}>{state === 'stopped' ? 'API stopped' : state}</span>
        </div>
        <button className="endpoint-link" onClick={() => navigate('server')}>
          {s?.api.endpoint ?? 'Connecting…'}
        </button>
        <HostStepBanner workspace={w} />
        <div className="cockpit-services">
          {(s?.loads ?? []).map((l) => (
            <span key={`${l.provider}/${l.model_id}`} className="service-chip">
              <b>{l.provider}</b>
              <span>{l.model_id}</span>
              <small>
                {loadStageText({ ...l, elapsed_ms: l.elapsed_ms + Math.max(0, Date.now() - l.at) })}
              </small>
            </span>
          ))}
          {s?.services.length ? (
            s.services.map((service) => (
              <button
                key={service.id}
                title="Manage engine and model"
                onClick={() => navigate('catalog')}
                className="service-chip"
              >
                <b>{service.provider}</b>
                <span>{service.model}</span>
                <small>{service.state}</small>
              </button>
            ))
          ) : (
            <button onClick={() => navigate('catalog')} className="service-chip">
              Load a model <span>Engines & Models →</span>
            </button>
          )}
        </div>
      </div>
      <div className="cockpit-right">
        <div className="metric-grid">
          <div>
            <strong>{metric(s?.metrics.requests)}</strong>
            <span>Requests · 5 min</span>
          </div>
          <div>
            <strong>{metric(s?.metrics.tokens_per_second, ' t/s')}</strong>
            <span>Token throughput</span>
          </div>
          <div>
            <strong>{metric(s?.metrics.mean_latency_ms, ' ms')}</strong>
            <span>Mean duration</span>
          </div>
          <div>
            <strong>{metric(s?.metrics.errors)}</strong>
            <span>Errors · 5 min</span>
          </div>
        </div>
        <div className="ew-actions">
          <Action
            primary={!s?.api.running}
            disabled={!s || waiting}
            onClick={() => {
              if (s?.api.running)
                ask({
                  title: 'Stop the API?',
                  actionLabel: 'Stop API',
                  danger: true,
                  children: <p>Active requests will be interrupted. Loaded models remain available.</p>,
                  onConfirm: () => w.execute('api.stop'),
                })
              else return w.execute('api.start')
            }}
          >
            {s?.api.running ? 'Stop API' : 'Start API'}
          </Action>
          <Action
            disabled={!s?.api.running || waiting}
            onClick={() => {
              ask({
                title: 'Restart the API?',
                actionLabel: 'Restart API',
                children: <p>Active requests will be interrupted.</p>,
                onConfirm: () => w.execute('api.restart'),
              })
            }}
          >
            Restart
          </Action>
          <Action
            disabled={!s || waiting}
            onClick={async () => {
              const result = await w.execute('api.ping')
              setPing(result)
            }}
          >
            Ping
          </Action>
        </div>
        <JsonResult value={ping} />
        <small className="core-caption">
          Core {text(s?.core.version)} · {s?.services.length ?? 0} loaded services
        </small>
      </div>
    </header>
  )
}
