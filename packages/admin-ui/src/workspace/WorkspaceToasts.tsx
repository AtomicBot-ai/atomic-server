import type { Workspace } from './useWorkspace'
import type { useWorkspaceNavigation } from './useWorkspaceNavigation'
import { UpdateToast } from './UpdateToast'
import { AccessRequestToast } from './AccessRequestToast'
import { accountPages } from './account/account-pages'
import './update-toast.css'

/**
 * The corner notices, stacked: a newer atc, and a device asking for access. Bottom right, or top right on
 * the chat, whose composer owns the bottom.
 */
export function WorkspaceToasts({
  workspace,
  navigation,
}: {
  workspace: Workspace
  navigation: ReturnType<typeof useWorkspaceNavigation>
}) {
  const chat = navigation.page === 'playground' && navigation.task === 'chat'
  return (
    <div className={`workspace-toasts${chat ? ' workspace-toasts-top' : ''}`}>
      <UpdateToast workspace={workspace} top={chat} />
      <AccessRequestToast
        workspace={workspace}
        hidden={navigation.page === 'account' && navigation.accountSection === 'remote'}
        onReview={accountPages(navigation).openRemoteModels}
      />
    </div>
  )
}
