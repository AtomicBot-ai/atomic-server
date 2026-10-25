import { useRef, useState } from 'react'
import type { Page } from './types'

/** Settings and connection guides return to the page that opened them. */
export function useWorkspaceNavigation() {
  const [page, setPage] = useState<Page>('server')
  const [serverSection, setServerSection] = useState('overview')
  const [catalogSection, setCatalogSection] = useState('catalog')
  const [settingsSection, setSettingsSection] = useState('admin')
  const [task, setTask] = useState('chat')
  const location = { page, serverSection, catalogSection, settingsSection, task }
  const settingsReturn = useRef(location)
  const connectionReturn = useRef<typeof location | null>(null)
  const restore = (previous: typeof location) => {
    setPage(previous.page)
    setServerSection(previous.serverSection)
    setCatalogSection(previous.catalogSection)
    setSettingsSection(previous.settingsSection)
    setTask(previous.task)
  }
  return {
    ...location,
    setPage,
    setServerSection,
    setCatalogSection,
    setSettingsSection,
    setTask,
    navigate: (next: Page) => {
      if (next === 'settings' && page !== 'settings') settingsReturn.current = location
      setPage(next)
    },
    backFromSettings: () => restore(settingsReturn.current),
    rememberConnection: () => {
      connectionReturn.current ??= location
    },
    restoreConnection: () => {
      if (connectionReturn.current) restore(connectionReturn.current)
      connectionReturn.current = null
    },
  }
}
