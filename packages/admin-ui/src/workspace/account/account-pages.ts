import type { useWorkspaceNavigation } from '../useWorkspaceNavigation'

type Navigation = ReturnType<typeof useWorkspaceNavigation>

/** Server → Remote access and Settings → Account, which the account screens and the request notice open. */
export function accountPages(navigation: Navigation) {
  return {
    openRemote: () => {
      navigation.setServerSection('remote')
      navigation.navigate('server')
    },
    openAccount: () => {
      navigation.setSettingsSection('account')
      navigation.navigate('settings')
    },
  }
}

/** The account service's sign-in page in a new tab; the server finishes the sign-in once it is approved. */
export function openSignInPage(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
