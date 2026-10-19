import type { Workspace } from './useWorkspace'
import type { Page } from './types'
import { Action } from './Controls'
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
      <Eye state={state} />
      <div className="cockpit-main">
        <div className="brand-row">
          <strong className="ew-brand">ATOMIC SERVER</strong>
          <span className={`state-label state-${state}`}>{state === 'stopped' ? 'API stopped' : state}</span>
        </div>
        <button className="endpoint-link" onClick={() => navigate('server')}>
          {s?.api.endpoint ?? 'Connecting…'}
        </button>
        <div className="cockpit-services">
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
            disabled={!s}
            onClick={() => {
              if (
                s?.api.running &&
                !window.confirm(
                  'Stop the API? Active requests will be interrupted. Loaded models remain available.'
                )
              )
                return
              return w.execute(s?.api.running ? 'api.stop' : 'api.start')
            }}
          >
            {s?.api.running ? 'Stop API' : 'Start API'}
          </Action>
          <Action
            disabled={!s?.api.running}
            onClick={() => {
              if (window.confirm('Restart the API? Active requests will be interrupted.'))
                return w.execute('api.restart')
            }}
          >
            Restart
          </Action>
          <Action
            disabled={!s}
            onClick={async () => {
              const result = await w.execute('api.ping')
              window.alert(`Server response\n${JSON.stringify(result, null, 2)}`)
            }}
          >
            Ping
          </Action>
        </div>
        <small className="core-caption">
          Core {text(s?.core.version)} · {s?.services.length ?? 0} loaded services
        </small>
      </div>
    </header>
  )
}
