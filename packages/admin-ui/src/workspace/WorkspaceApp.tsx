import { useThemeStore } from '@/hooks/useTheme'
import { useEffect, useState } from 'react'
import { setupFinished } from '@view'
import { PanelLeft } from 'lucide-react'
import { EngineIntro } from './intro/EngineIntro'
import { WorkspaceBrand } from './WorkspaceBrand'
import { workspaceTheme } from './workspace-theme'
import { useWorkspace } from './useWorkspace'
import { UpdateToast } from './UpdateToast'
import { Server } from './server/Server'
import { Settings } from './server/settings/Settings'
import { Catalog } from './library/catalog/Catalog'
import { Chat } from './chat/Chat'
import { Media } from './media/Media'
import { AudioStudio } from './media/AudioStudio'
import { CommandDock } from './CommandDock'
import { SetupWizard } from './setup/SetupWizard'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { useWorkspaceSidebar } from './useWorkspaceSidebar'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'
import { useCatalogNavigation } from './useCatalogNavigation'
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts'
import { Action } from './Controls'
import { HelpMenu } from './HelpMenu'
import { FloatingDownloads } from './library/downloads/FloatingDownloads'
import { useAcquisition } from './useAcquisition'
import './styles/workspace.css'
import './styles/desktop-shell.css'
import './server/server-desktop.css'
import './server/settings/server-settings.css'
import './server/server-sidebar.css'
import './styles/desktop-parity.css'
import './styles/desktop-controls.css'
import './styles/workspace-brand.css'
import './styles/workspace-theme.css'
import './styles/workspace-sizing.css'
import './styles/settings-screens.css'
import './styles/task-forms.css'
import './styles/secondary-forms.css'

export function WorkspaceApp() {
  const [intro, setIntro] = useState(true)
  return intro ? <EngineIntro onContinue={() => setIntro(false)} /> : <WorkspaceContent />
}
function WorkspaceContent() {
  const theme = useThemeStore((state) => state.theme)
  const workspace = useWorkspace()
  const navigation = useWorkspaceNavigation()
  const {
    page,
    setPage,
    serverSection,
    setServerSection,
    catalogSection,
    setCatalogSection,
    settingsSection,
    setSettingsSection,
    task,
    setTask,
  } = navigation
  useAcquisition(setPage, setCatalogSection, setServerSection)
  const [agent, setAgent] = useState<string | undefined>(undefined)
  const [connectionGuide, setConnectionGuide] = useState(false)
  const [prepared, setPrepared] = useState<string[]>([])
  const [command, setCommand] = useState<string | null>(null)
  const { catalogCategory, catalogFor, openCatalog } = useCatalogNavigation(page)
  const [wizard, setWizard] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [help, setHelp] = useState(false)
  const [trySkill, setTrySkill] = useState<string | null>(null)
  useEffect(() => {
    const tryInChat = (event: Event) => {
      const name = (event as CustomEvent<unknown>).detail
      if (typeof name !== 'string' || !name) return
      setTrySkill(name)
      setTask('chat')
      setPage('playground')
    }
    window.addEventListener('atomic:try-skill', tryInChat)
    return () => window.removeEventListener('atomic:try-skill', tryInChat)
  }, [setPage, setTask])
  const [historyContainer, setHistoryContainer] = useState<HTMLDivElement | null>(null)
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, expanded, toggle, reveal } = useWorkspaceSidebar()
  // Automatic onboarding follows the shared state; an explicitly reopened guide stays local.
  const openWizard =
    wizard || Boolean(workspace.snapshot && !setupFinished(workspace.snapshot.setup) && !setupDismissed)
  useWorkspaceShortcuts({
    navigation,
    openWizard,
    sidebarOpen,
    setSidebarOpen,
    command,
    setCommand,
    help,
    setHelp,
  })
  const section = page === 'server' ? serverSection : page === 'catalog' ? catalogSection : settingsSection
  const selectSection =
    page === 'server' ? setServerSection : page === 'catalog' ? setCatalogSection : setSettingsSection
  const models = (section = 'catalog', engine?: string, category?: string) => {
    setCatalogSection(section)
    // A new key opens the catalog afresh, so it takes the engine's format and filter every time.
    openCatalog(engine, category)
    setPage('catalog')
  }
  const settings = () => {
    setServerSection('configuration')
    setPage('server')
  }
  const connect = (id: string) => {
    navigation.rememberConnection()
    setSidebarOpen(false)
    setAgent(id)
    setConnectionGuide(true)
    setServerSection('overview')
    setPage('server')
  }
  return (
    <div
      style={workspaceTheme(theme)}
      className={`eye-workspace desktop-workspace ${sidebarOpen ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
    >
      <WorkspaceNavigation
        page={page}
        section={section}
        task={task}
        workspace={workspace}
        historyContainerRef={setHistoryContainer}
        navigate={(next) => {
          navigation.navigate(next)
          reveal()
        }}
        selectSection={(value) => {
          selectSection(value)
          setSidebarOpen(false)
        }}
        selectTask={(value) => {
          setTask(value)
          setSidebarOpen(false)
        }}
        connectAgent={connect}
        prepared={prepared}
        openHelp={() => setHelp(true)}
      />
      <div className="desktop-main">
        <header className="desktop-topbar">
          <button
            className="sidebar-toggle"
            aria-label="Toggle sidebar"
            aria-expanded={expanded}
            onClick={toggle}
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
          <WorkspaceBrand />
          {!openWizard && !connectionGuide && <FloatingDownloads workspace={workspace} />}
        </header>
        <UpdateToast workspace={workspace} top={page === 'playground' && task === 'chat'} />
        {workspace.error && (
          <div className="ew-error connection-error" role="alert">
            <span>{workspace.error}</span>
            <Action onClick={workspace.refresh}>Retry</Action>
          </div>
        )}
        <main className={`workspace-content ${page === 'playground' && task === 'chat' ? 'chat-page' : ''}`}>
          {page === 'server' && (
            <Server
              workspace={workspace}
              openCommand={setCommand}
              openSetup={() => {
                navigation.rememberConnection()
                setAgent(undefined)
                setConnectionGuide(true)
                setServerSection('overview')
                setPage('server')
              }}
              section={serverSection}
              onSection={setServerSection}
              initialAgent={agent}
              showGuide={connectionGuide}
              closeGuide={() => {
                setConnectionGuide(false)
                navigation.restoreConnection()
              }}
              connectAgent={connect}
              prepared={prepared}
              onPrepared={(id) => setPrepared((items) => [...new Set([...items, id])])}
              openSettings={settings}
              openModels={(engine) => models('catalog', engine)}
            />
          )}
          {page === 'catalog' && (
            <Catalog
              key={`${catalogFor?.opened ?? 'catalog'}:${catalogCategory}`}
              initialCategory={catalogCategory}
              {...(catalogFor ? { engine: catalogFor.engine } : {})}
              workspace={workspace}
              openCommand={setCommand}
              section={catalogSection}
              onSection={setCatalogSection}
            />
          )}
          {page === 'settings' && (
            <Settings
              workspace={workspace}
              section={settingsSection}
              openCommand={setCommand}
              openEngines={() => models('engines')}
            />
          )}
          {page === 'playground' &&
            (task === 'chat' ? (
              <Chat
                workspace={workspace}
                onCatalog={(section) => models(section)}
                historyContainer={historyContainer}
                trySkill={trySkill}
                onSkillStarted={() => setTrySkill(null)}
              />
            ) : task === 'audio' ? (
              <AudioStudio workspace={workspace} onCatalog={() => models('catalog', undefined, 'audio')} />
            ) : (
              <Media
                key={task}
                workspace={workspace}
                task={task}
                openCommand={setCommand}
                onCatalog={() => models('catalog', undefined, task)}
              />
            ))}
        </main>
      </div>
      {sidebarOpen && (
        <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />
      )}
      {command && (
        <CommandDock
          key={command}
          operations={workspace.operations}
          execute={workspace.execute}
          selected={command}
          onClose={() => setCommand(null)}
        />
      )}
      {help && (
        <HelpMenu
          onClose={() => setHelp(false)}
          onCommands={() => {
            setHelp(false)
            setCommand('operations.list')
          }}
          onSetup={() => {
            setHelp(false)
            setWizard(true)
          }}
        />
      )}
      {openWizard && (
        <SetupWizard
          onDestination={(destination) => {
            setWizard(false)
            setSetupDismissed(true)
            setPage('server')
            setServerSection(destination === 'endpoint' ? 'configuration' : 'overview')
          }}
          onChat={() => {
            setWizard(false)
            setSetupDismissed(true)
            setPage('playground')
            setTask('chat')
          }}
          onConfigure={() => setWizard(true)}
          workspace={workspace}
          onPrepared={(id) => setPrepared((items) => [...new Set([...items, id])])}
          onOpenGoal={(_goal, selectedAgent) => {
            setWizard(false)
            setSetupDismissed(true)
            connect(selectedAgent ?? agent ?? 'atomic-agent')
          }}
          onClose={() => {
            setWizard(false)
            setSetupDismissed(true)
            setServerSection('overview')
            setPage('server')
          }}
        />
      )}
    </div>
  )
}
