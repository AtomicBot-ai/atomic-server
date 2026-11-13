import { useState } from 'react'
import { deviceLabel, formatCheckCode, platformLabel } from '@view'
import type { AccountRemoteDevice, WorkspaceRemoteHost } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { DeleteConfirmation } from '../library/DeleteConfirmation'

const since = (ms: number) =>
  `since ${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

/** Devices asking for access (allow only on a matching check code), and the devices that have it. */
export function RemoteDevices({
  workspace: w,
  remote,
}: {
  workspace: Workspace
  remote: WorkspaceRemoteHost
}) {
  const [revoke, setRevoke] = useState<AccountRemoteDevice | null>(null)
  const decide = (grant_id: string, allow: boolean) => w.execute('account.remote.decide', { grant_id, allow })
  return (
    <>
      {remote.requests.length > 0 && (
        <section className="remote-share-group" aria-label="Asking for access">
          <h3>Asking for access</h3>
          <p>Allow a device only when its check code matches the one on its screen.</p>
          <ul className="remote-share-list">
            {remote.requests.map((request) => (
              <li key={request.grant_id}>
                <div>
                  <strong>{deviceLabel(request)}</strong>
                  <small>
                    {platformLabel(request.platform) && `${platformLabel(request.platform)} · `}
                    Check code{' '}
                    <code className="remote-check-code">{formatCheckCode(request.check_code)}</code>
                  </small>
                </div>
                <div className="ew-actions">
                  <Action
                    ariaLabel={`Deny ${deviceLabel(request)}`}
                    onClick={() => decide(request.grant_id, false)}
                  >
                    Deny
                  </Action>
                  <Action
                    primary
                    ariaLabel={`Allow ${deviceLabel(request)}`}
                    onClick={() => decide(request.grant_id, true)}
                  >
                    Allow
                  </Action>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="remote-share-group" aria-label="Devices with access">
        <h3>Devices with access</h3>
        {remote.devices.length === 0 ? (
          <p>No device has access yet.</p>
        ) : (
          <ul className="remote-share-list">
            {remote.devices.map((device) => (
              <li key={device.grant_id}>
                <div>
                  <strong>{deviceLabel(device)}</strong>
                  <small>
                    {[platformLabel(device.platform), since(device.since)].filter(Boolean).join(' · ')}
                  </small>
                </div>
                <Action danger ariaLabel={`Revoke ${deviceLabel(device)}`} onClick={() => setRevoke(device)}>
                  Revoke
                </Action>
              </li>
            ))}
          </ul>
        )}
      </section>
      {revoke && (
        <DeleteConfirmation
          title="Revoke access?"
          name={deviceLabel(revoke)}
          detail="Its key stops working from the next request. The device can pair again later."
          confirm="Revoke access"
          cancel="Cancel"
          onClose={() => setRevoke(null)}
          onConfirm={() => w.execute('account.remote.revoke', { grant_id: revoke.grant_id })}
        />
      )}
    </>
  )
}
