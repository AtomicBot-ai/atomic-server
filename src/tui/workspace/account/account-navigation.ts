/** The Account page, as in the desktop app: its rail item, opening its tabs, and leaving it once accounts are off. */
import { ACCOUNT_SECTIONS } from '../../../contract/index.js'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import type { ActionContext } from '../action-types.js'
import { graphemes } from '../draw/canvas.js'
import { PAGE_FOCUS } from '../workspace-pages.js'
import type { WorkspaceState } from '../state.js'
import { isAccountOverlay, onAccountTab, shownAccount } from './account-model.js'

/** The rail's face of the account: `(o)` signed out, the initial of its name (else of its email) once in. */
export function accountIcon(account: WorkspaceAccount): string {
  const user = account.signed_in ? account.user : null
  const name = user ? user.display_name?.trim() || user.email.trim() : ''
  return `(${graphemes(name)[0]?.toUpperCase() ?? 'o'})`
}

/** The rail item at the top of its bottom group, while accounts are on. */
export function accountRailItem(workspace: WorkspaceSnapshot | null | undefined) {
  const account = shownAccount(workspace)
  return account ? { id: 'page:account', label: 'Account', icon: accountIcon(account) } : null
}

/**
 * `page:account` opens the page on its current tab, `account-section:<id>` on that tab; nothing happens
 * before setup is complete or while accounts are off.
 */
export function accountNavigationAction(id: string, ctx: ActionContext): boolean {
  const section = id.startsWith('account-section:') ? id.slice('account-section:'.length) : null
  if (id !== 'page:account' && section === null) return false
  const s = ctx.get(),
    tab = ACCOUNT_SECTIONS.find((item) => item.id === (section ?? s.accountView))
  if (!s.setupComplete || !shownAccount(s.workspace) || !tab) return true
  ctx.update((v) => ({
    ...v,
    ...onAccountTab(tab.id),
    overlay: null,
    selected: 0,
    scroll: 0,
    edit: '',
    message: '',
  }))
  return true
}

/** The Account page once accounts are turned off is the Server page; the account's dialogs close with it. */
export function leaveAccountPage(s: WorkspaceState): WorkspaceState {
  if (s.page !== 'account' || shownAccount(s.workspace)) return s
  return {
    ...s,
    page: 'server',
    serverView: 'overview',
    focus: PAGE_FOCUS.server,
    hover: '',
    ...(isAccountOverlay(s.overlay) ? { overlay: null } : {}),
  }
}
