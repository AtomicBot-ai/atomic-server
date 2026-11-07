import type { ManagedVerdict } from '@contract'
import { engineName, formatSize, verdictLine } from '@view'

/** Present the core's verdict separately from installation state and diagnostic details. */
export function ManagedCompatibility({ verdicts }: { verdicts: ManagedVerdict[] }) {
  return (
    <section className="runtime-compatibility" aria-label="Engine compatibility">
      <h3>Engine compatibility</h3>
      {!verdicts.length && <p>No compatibility results are available for this model.</p>}
      <ul>
        {verdicts.map((v) => {
          const c = v.compatibility
          const status = !c
            ? v.error?.code === 'MANAGED_PREREQUISITE_BLOCKED'
              ? 'Setup required'
              : 'Check unavailable'
            : !c.verdict.ok
              ? 'Not compatible'
              : v.installed
                ? 'Ready to download'
                : 'Install required'
          const message = !c
            ? (v.error?.message ?? 'The engine did not return a compatibility result.')
            : !c.verdict.ok
              ? c.verdict.error.message
              : v.installed
                ? 'Compatible with this device.'
                : 'Compatible with this device. Install the engine to continue.'
          return (
            <li key={v.engine}>
              <div className="runtime-compatibility-heading">
                <strong>{engineName(v.engine)}</strong>
                <span className="runtime-model-badge" data-ready={Boolean(c?.verdict.ok)}>
                  {status}
                </span>
              </div>
              <p className="runtime-compatibility-message">{message}</p>
              {c?.verdict.ok && c.weight_bytes > 0 && (
                <small className="ew-muted">Model weights · {formatSize(c.weight_bytes)}</small>
              )}
              {c?.warnings?.map((warning, index) => (
                <p key={index} className="runtime-compatibility-warning">
                  {warning.message}
                </p>
              ))}
              <details className="runtime-model-details">
                <summary>Details</summary>
                <p>{verdictLine(v)}</p>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
