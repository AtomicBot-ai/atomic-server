import type { ManagedEngineState } from '@contract'
import { formatSize, planBlocked, planLines } from '@view'

/** The core's consent plan, with requirements visible and its technical identity in a disclosure. */
export function EnginePlan({ state }: { state: ManagedEngineState }) {
  const plan = state.plan
  if (!plan || planBlocked(plan))
    return (
      <div className="engine-plan-lines">
        {planLines(state).map((line, i) => (
          <p key={i}>{line.trim()}</p>
        ))}
      </div>
    )
  return (
    <div className="engine-consent-plan">
      <h4>Required system changes</h4>
      {plan.system_changes.length ? (
        <ul>
          {plan.system_changes.map((change, i) => (
            <li key={i}>{change.text}</li>
          ))}
        </ul>
      ) : (
        <p>
          {plan.adopts_existing_engine
            ? 'No system changes. The existing container engine will be used.'
            : 'No system changes.'}
        </p>
      )}
      <dl className="engine-plan-resources">
        <div>
          <dt>Download</dt>
          <dd>{formatSize(plan.download_bytes)}</dd>
        </div>
        <div>
          <dt>Disk needed</dt>
          <dd>{formatSize(plan.required_disk_bytes)}</dd>
        </div>
        {plan.free_disk_bytes !== null && (
          <div>
            <dt>Free disk space</dt>
            <dd>{formatSize(plan.free_disk_bytes)}</dd>
          </div>
        )}
      </dl>
      {plan.docker_root_dir && <p className="ew-muted">Storage: {plan.docker_root_dir}</p>}
      <p>
        {plan.requires_elevation
          ? 'Administrator approval is required for these system changes.'
          : 'No administrator rights required.'}
      </p>
      {plan.may_require_relogin && <p>You may need to sign in again for the docker group to apply.</p>}
      {plan.may_require_reboot && <p>Windows may need a restart once WSL is turned on.</p>}
      {plan.warnings.length > 0 && (
        <div>
          <h4>Before you continue</h4>
          <ul>
            {plan.warnings.map((warning, i) => (
              <li key={i}>{warning.text}</li>
            ))}
          </ul>
        </div>
      )}
      {state.notices.length > 0 && (
        <div>
          <h4>Notices</h4>
          <ul>
            {state.notices.map((notice, i) => (
              <li key={i}>{notice}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="engine-diagnostics">
        <summary>Plan details</summary>
        {plan.descriptor_id && <p>Release: {plan.descriptor_id}</p>}
        <p>
          Plan digest: <code>{plan.plan_digest}</code>
        </p>
      </details>
    </div>
  )
}
