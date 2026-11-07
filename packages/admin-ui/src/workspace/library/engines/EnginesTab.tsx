import { ChevronRight } from 'lucide-react'
import { engineName, engineStatus } from '@view'
import type { WorkspaceSnapshot } from '@contract'
import { Empty } from '../../Controls'
import { record, text } from '../../types'
import type { RecordValue } from '../../types'
import './engine-directory.css'

/** The directory navigates to an engine; installation and settings live in its detail panel. */
export function EnginesTab({
  engines,
  snapshot,
  loading,
  onSettings,
}: {
  engines: RecordValue[]
  snapshot?: WorkspaceSnapshot | null
  loading: boolean
  onSettings: (engine: string) => void
}) {
  const entries = engines.map((engine) => {
    const id = text(engine.engine)
    const active = record(engine.active)
    const installed =
      Boolean(active.version) ||
      (Array.isArray(engine.builds) && engine.builds.length > 0) ||
      snapshot?.engines?.some((item) => item.engine === id && item.installation?.status === 'ready')
    const fullStatus = engineStatus(engine, snapshot)
    const [status, ...details] = fullStatus.startsWith('Installed')
      ? fullStatus.split(' · ')
      : [fullStatus.startsWith('Unavailable:') ? 'Unavailable' : fullStatus]
    const build = details.join(' · ') || [active.version, active.variant].filter(Boolean).join(' · ')
    return {
      id,
      installed: Boolean(installed),
      status,
      build,
      error: text(engine.source_error, fullStatus.startsWith('Unavailable:') ? fullStatus.slice(13) : ''),
    }
  })
  if (loading && !entries.length) return <Empty>Checking engines…</Empty>
  if (!entries.length) return <Empty>No engines available on this server.</Empty>
  return (
    <div className="engine-directory">
      {[true, false].map((installed) => {
        const group = entries.filter((entry) => entry.installed === installed)
        const title = installed ? 'Installed' : 'Available to install'
        return (
          group.length > 0 && (
            <section className="engine-directory-group" key={title} aria-label={title}>
              <div className="engine-directory-heading">
                <h2>{title}</h2>
                <span>{group.length}</span>
              </div>
              <ul className="engine-directory-list">
                {group.map((entry) => (
                  <li key={entry.id}>
                    <button
                      id={`engine-directory-${entry.id}`}
                      type="button"
                      className="engine-directory-item"
                      aria-label={engineName(entry.id)}
                      aria-describedby={`engine-directory-${entry.id}-detail`}
                      aria-haspopup="dialog"
                      onClick={() => onSettings(entry.id)}
                    >
                      <span className="engine-directory-copy">
                        <strong>{engineName(entry.id)}</strong>
                        {entry.build && <small>{entry.build}</small>}
                      </span>
                      <span
                        className="engine-directory-status"
                        data-installed={entry.installed}
                        id={`engine-directory-${entry.id}-detail`}
                      >
                        {entry.status}
                        {entry.build && <span className="sr-only"> · {entry.build}</span>}
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    {entry.error && (
                      <p role="alert" className="engine-directory-error">
                        {entry.error}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        )
      })}
    </div>
  )
}
