import { useState } from 'react'
import { accountLine, sharingLine, STOP_SHARING_DETAIL } from '@view'
import type { AccountPairingCode, WorkspaceAccount } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { SettingsField, SettingsSection } from '../SettingsForm'
import { describeError } from '@/services/admin-api'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { AddDeviceDialog } from './AddDeviceDialog'
import { RemoteDevices } from './RemoteDevices'
import './account.css'
import './remote-share.css'

/**
 * Account → Remote models, "Share with your devices": the account's devices use this server's API, each with
 * its own key, over the tunnel or the local network. Turning it off ends every device's access, so it asks
 * first while devices have it. For a signed-in account only; the Account page shows the sign-in instead.
 */
export function RemoteShare({ workspace: w, account }: { workspace: Workspace; account: WorkspaceAccount }) {
  const [pairing, setPairing] = useState<AccountPairingCode | null>(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState('')
  const [stopping, setStopping] = useState(false)
  const remote = account.remote
  const share = async (enabled: boolean) => {
    setSwitching(true)
    setError('')
    setAdded('')
    try {
      await w.execute('account.remote.share', { enabled })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSwitching(false)
    }
  }
  return (
    <SettingsSection
      title="Share with your devices"
      description="Devices signed in to your Atomic Chat account can use this server’s API. Each device pairs once and gets its own key; stopping sharing ends access for all of them."
    >
      <SettingsField label="Share this server" hint={accountLine(account)}>
        <input
          type="checkbox"
          role="switch"
          checked={remote.sharing}
          disabled={switching}
          aria-busy={switching || undefined}
          onChange={(event) => {
            if (!event.target.checked && remote.devices.length > 0) setStopping(true)
            else void share(event.target.checked)
          }}
        />
      </SettingsField>
      <div className="remote-access-body">
        <p role="status">{added ? `${added} can now use this server.` : sharingLine(remote)}</p>
        {error && (
          <p className="ew-error" role="alert">
            {error}
          </p>
        )}
        {remote.sharing && (
          <div className="remote-access-actions">
            <Action
              primary
              onClick={async () => {
                setAdded('')
                setPairing(await w.execute<AccountPairingCode>('account.remote.pairing.open'))
              }}
            >
              Add a device
            </Action>
          </div>
        )}
      </div>
      <RemoteDevices workspace={w} remote={remote} />
      {stopping && (
        <DeleteConfirmation
          title="Stop sharing?"
          name={`${remote.devices.length} ${remote.devices.length === 1 ? 'device has' : 'devices have'} access`}
          detail={STOP_SHARING_DETAIL}
          confirm="Stop sharing"
          cancel="Keep sharing"
          onClose={() => setStopping(false)}
          onConfirm={() => share(false)}
        />
      )}
      {pairing && (
        <AddDeviceDialog
          workspace={w}
          pairing={pairing}
          onClose={() => setPairing(null)}
          onPaired={(device) => {
            setPairing(null)
            setAdded(device)
          }}
        />
      )}
    </SettingsSection>
  )
}
