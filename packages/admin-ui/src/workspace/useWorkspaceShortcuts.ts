import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { WORKSPACE_NAVIGATION } from '@contract'
import type { useWorkspaceNavigation } from './useWorkspaceNavigation'

export function useWorkspaceShortcuts(options: {
  navigation: ReturnType<typeof useWorkspaceNavigation>
  openWizard: boolean
  sidebarOpen: boolean
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  command: string | null
  setCommand: Dispatch<SetStateAction<string | null>>
  help: boolean
  setHelp: Dispatch<SetStateAction<boolean>>
}) {
  useEffect(() => {
    const { navigation, openWizard, sidebarOpen, setSidebarOpen, command, setCommand, help, setHelp } =
      options
    const { page, task } = navigation
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || openWizard || document.querySelector('[aria-modal="true"]')) return
      if (event.key === 'F4') {
        event.preventDefault()
        setCommand((current) => (current ? null : 'api.ping'))
      } else if (event.key === 'F1') {
        event.preventDefault()
        setHelp((value) => !value)
      } else if (
        page === 'playground' &&
        task === 'chat' &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'n'
      ) {
        event.preventDefault()
        window.dispatchEvent(new Event('atomic:new-chat'))
      } else if (event.altKey && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault()
        navigation.navigate(WORKSPACE_NAVIGATION[Number(event.key) - 1].id)
      } else if (event.key === 'Escape') {
        if (page === 'settings' && !sidebarOpen && !command && !help) navigation.backFromSettings()
        setSidebarOpen(false)
        setCommand(null)
        setHelp(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options])
}
