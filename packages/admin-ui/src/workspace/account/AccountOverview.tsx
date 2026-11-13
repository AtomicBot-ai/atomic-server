import { useState } from 'react'
import { accountLine, sharingLine } from '@view'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { SettingsSection } from '../SettingsForm'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { AccountSignIn } from './AccountSignIn'
import './account.css'

/**
 * Account → Overview: the Atomic Chat account this server is signed in to, or the way to sign it in.
 * Nothing at all while accounts are off on the server (`account.enabled`).
 */
export function AccountOverview({
  workspace: w,
  openRemote,
}: {
  workspace: Workspace
  openRemote?: () => void
}) {
  const [signingOut, setSigningOut] = useState(false)
  const account = w.snapshot?.account
  if (account?.enabled !== true) return null
  if (!account.signed_in) return <AccountSignIn workspace={w} account={account} />
  const email = account.user?.email ?? ''
  return (
    <>
      <SettingsSection title="Atomic Chat account" description={accountLine(account)}>
        <div className="settings-item">
          <strong>Email</strong>
          <span className="settings-value">{email}</span>
        </div>
        <div className="settings-item">
          <div>
            <strong>Your devices</strong>
            <small>{sharingLine(account.remote)}</small>
          </div>
          {openRemote && <Action onClick={() => openRemote()}>Manage devices</Action>}
        </div>
        <div className="settings-item">
          <div>
            <strong>Sign out</strong>
            <small>Every device that uses this server loses access and must pair again.</small>
          </div>
          <Action danger onClick={() => setSigningOut(true)}>
            Sign out
          </Action>
        </div>
      </SettingsSection>
      {signingOut && (
        <DeleteConfirmation
          title="Sign out of this account?"
          name={email}
          detail="Every device that uses this server loses access right away and must pair again after you sign back in."
          confirm="Sign out"
          cancel="Cancel"
          onClose={() => setSigningOut(false)}
          onConfirm={() => w.execute('account.signout')}
        />
      )}
    </>
  )
}
