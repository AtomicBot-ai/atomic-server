import type { useWorkspaceNavigation } from '../useWorkspaceNavigation'

type Navigation = ReturnType<typeof useWorkspaceNavigation>

/** The Account section's tabs, which the account screens, Server → Remote access and the request notice open. */
export function accountPages(navigation: Navigation) {
  const open = (section: 'overview' | 'remote') => {
    navigation.setAccountSection(section)
    navigation.navigate('account')
  }
  return { openOverview: () => open('overview'), openRemoteModels: () => open('remote') }
}

/** The account service's sign-in page in a new tab; the server finishes the sign-in once it is approved. */
export function openSignInPage(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
