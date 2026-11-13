import { useRef, useState } from 'react'
import type { Page } from './types'

/** Settings and connection guides return to the page that opened them. */
export function useWorkspaceNavigation() {
  const [page, setPage] = useState<Page>('server')
  const [serverSection, setServerSection] = useState('overview')
  const [catalogSection, setCatalogSection] = useState('catalog')
  const [settingsSection, setSettingsSection] = useState('admin')
  const [accountSection, setAccountSection] = useState('overview')
  const [task, setTask] = useState('chat')
  const location = { page, serverSection, catalogSection, settingsSection, accountSection, task }
  const settingsReturn = useRef(location)
  const connectionReturn = useRef<typeof location | null>(null)
  const restore = (previous: typeof location) => {
    setPage(previous.page)
    setServerSection(previous.serverSection)
    setCatalogSection(previous.catalogSection)
    setSettingsSection(previous.settingsSection)
    setAccountSection(previous.accountSection)
    setTask(previous.task)
  }
  // The open page's section and its setter; Settings' for the Playground, which has tasks instead.
  const [section, selectSection] =
    page === 'server'
      ? [serverSection, setServerSection]
      : page === 'catalog'
        ? [catalogSection, setCatalogSection]
        : page === 'account'
          ? [accountSection, setAccountSection]
          : [settingsSection, setSettingsSection]
  return {
    ...location,
    section,
    selectSection,
    setPage,
    setServerSection,
    setCatalogSection,
    setSettingsSection,
    setAccountSection,
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
