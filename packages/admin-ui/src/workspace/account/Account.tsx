import { useEffect } from 'react'
import { ACCOUNT_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import type { useWorkspaceNavigation } from '../useWorkspaceNavigation'
import { AccountOverview } from './AccountOverview'
import { AccountSignIn } from './AccountSignIn'
import { RemoteShare } from './RemoteShare'

/**
 * The Account section, as in the desktop app: Overview signs the server in and out, Remote models shares it
 * with the account's devices. Remote models asks for the sign-in too while nobody is signed in. Accounts
 * turned off while the page is open send the person back to Server.
 */
export function Account({
  workspace: w,
  navigation,
}: {
  workspace: Workspace
  navigation: Pick<
    ReturnType<typeof useWorkspaceNavigation>,
    'accountSection' | 'setAccountSection' | 'setPage'
  >
}) {
  const { accountSection, setAccountSection, setPage } = navigation
  const account = w.snapshot?.account
  const off = Boolean(w.snapshot) && account?.enabled !== true
  useEffect(() => {
    if (off) setPage('server')
  }, [off, setPage])
  if (!account?.enabled) return null
  const remote = accountSection === 'remote'
  return (
    <div className="settings-page settings-form account-page">
      <div className="page-heading">
        <div>
          <h1>{remote ? ACCOUNT_SECTIONS.find((item) => item.id === 'remote')?.label : 'Account'}</h1>
        </div>
      </div>
      {!remote ? (
        <AccountOverview workspace={w} openRemote={() => setAccountSection('remote')} />
      ) : account.signed_in ? (
        <RemoteShare workspace={w} account={account} />
      ) : (
        <AccountSignIn workspace={w} account={account} />
      )}
    </div>
  )
}
