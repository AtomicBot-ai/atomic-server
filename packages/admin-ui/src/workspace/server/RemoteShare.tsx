import { useState } from 'react'
import { accountLine, sharingLine } from '@view'
import type { AccountPairingCode } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { SettingsField, SettingsSection } from '../SettingsForm'
import { describeError } from '@/services/admin-api'
import { AddDeviceDialog } from './AddDeviceDialog'
import { RemoteDevices } from './RemoteDevices'
import '../account/account.css'
import './remote-share.css'

/**
 * "Share with your devices": the account's devices use this server's API, each with its own key, over the
 * tunnel or the local network. Nothing while accounts are off; a pointer to Settings → Account while
 * signed out.
 */
export function RemoteShare({
  workspace: w,
  openAccount,
}: {
  workspace: Workspace
  openAccount?: () => void
}) {
  const [pairing, setPairing] = useState<AccountPairingCode | null>(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState('')
  const account = w.snapshot?.account
  if (account?.enabled !== true) return null
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
      description="Devices signed in to your Atomic Chat account can use this server’s API. Each device pairs once and gets its own key."
    >
      {!account.signed_in ? (
        <p className="remote-share-signed-out">
          Sign in to share this server with your devices:{' '}
          <button type="button" className="account-link" onClick={openAccount}>
            Settings → Account
          </button>
        </p>
      ) : (
        <>
          <SettingsField label="Share this server" hint={accountLine(account)}>
            <input
              type="checkbox"
              role="switch"
              checked={remote.sharing}
              disabled={switching}
              aria-busy={switching || undefined}
              onChange={(event) => void share(event.target.checked)}
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
        </>
      )}
    </SettingsSection>
  )
}
