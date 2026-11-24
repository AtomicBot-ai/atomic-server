import { CircleUserRound } from 'lucide-react'
import type { WorkspaceAccount } from '@contract'
import { accountLine } from '@view'
import './account.css'

/** The first letter of the account's name, else of its email: the avatar's face. */
const accountInitial = (user: NonNullable<WorkspaceAccount['user']>): string =>
  (user.display_name?.trim() || user.email.trim()).charAt(0).toUpperCase()

/**
 * The Account item at the top of the rail's bottom group, as in the desktop app: the account's initial once
 * signed in, a person icon before. Shown only while accounts are on.
 */
export function AccountRailItem({
  account,
  active,
  onOpen,
}: {
  account: WorkspaceAccount
  active: boolean
  onOpen: () => void
}) {
  const user = account.signed_in ? account.user : null
  return (
    <button
      className={`rail-item ${active ? 'active' : ''}`}
      aria-label="Account"
      aria-current={active ? 'page' : undefined}
      title={user ? accountLine(account) : 'Sign in'}
      onClick={onOpen}
    >
      {user ? (
        <span className="rail-avatar" aria-hidden="true">
          {accountInitial(user)}
        </span>
      ) : (
        <CircleUserRound size={20} strokeWidth={1.6} />
      )}
      <span>Account</span>
    </button>
  )
}
