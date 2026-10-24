// Lifted from Atomic-Chat/web-app/src/components/left-sidebar/index.tsx @ 807b4d9; adapted: shared server workspace and chat history.
import {
  Blocks,
  RadioTower,
  Settings,
  FlaskConical,
  LifeBuoy,
  ExternalLink,
  ChevronRight,
  Download,
  Cloud,
  Network,
  Cpu,
  SlidersHorizontal,
  Globe,
  Shield,
  Search,
  MessageCircle,
  Image,
  Video,
} from 'lucide-react'
import {
  WORKSPACE_NAVIGATION,
  CONNECTION_AGENTS,
  SERVER_NAVIGATION,
  LIBRARY_SECTIONS,
  SETTINGS_SECTIONS,
  SETTINGS_WORKSPACE_SECTIONS,
  PLAYGROUND_TASKS,
} from '@contract'
import type { Page } from './types'
import type { Workspace } from './useWorkspace'
import { ServerControlPanel } from './server/ServerControlPanel'
import { AgentIcon } from './server/AgentIcon'
import { Fragment } from 'react'
import type { Ref } from 'react'

const sectionIcons = {
  downloads: Download,
  catalog: Blocks,
  cloud: Cloud,
  endpoint: Network,
  engines: Cpu,
  overview: Blocks,
  configuration: SlidersHorizontal,
  remote: Globe,
  proxy: Shield,
  chat: MessageCircle,
  image: Image,
  video: Video,
}
const icons = { server: RadioTower, catalog: Blocks, settings: Settings, playground: FlaskConical }

export function WorkspaceNavigation({
  page,
  section,
  task,
  workspace,
  navigate,
  selectSection,
  selectTask,
  connectAgent,
  openHelp,
  openSetup,
  prepared = [],
  historyContainerRef,
}: {
  page: Page
  section: string
  task: string
  workspace: Workspace
  navigate: (page: Page) => void
  selectSection: (section: string) => void
  selectTask: (task: string) => void
  connectAgent: (id: string) => void
  openHelp: () => void
  openSetup: () => void
  prepared?: string[]
  historyContainerRef?: Ref<HTMLDivElement>
}) {
  const items =
    page === 'server'
      ? SERVER_NAVIGATION
      : page === 'catalog'
        ? LIBRARY_SECTIONS
        : page === 'settings'
          ? [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS]
          : PLAYGROUND_TASKS
  const title = WORKSPACE_NAVIGATION.find((item) => item.id === page)?.label
  return (
    <>
      <nav className="desktop-rail" aria-label="Main">
        {[...WORKSPACE_NAVIGATION]
          .filter((item) => item.id !== 'settings')
          .sort(
            (a, b) =>
              ['server', 'playground', 'catalog'].indexOf(a.id) -
              ['server', 'playground', 'catalog'].indexOf(b.id)
          )
          .map((item) => {
            const index = WORKSPACE_NAVIGATION.findIndex((v) => v.id === item.id)
            const Icon = icons[item.id]
            return (
              <button
                key={item.id}
                className={`rail-item ${page === item.id ? 'active' : ''}`}
                aria-label={item.label}
                aria-current={page === item.id ? 'page' : undefined}
                title={`${item.label} · Alt+${index + 1}`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={20} strokeWidth={1.6} />
                <span>{item.label}</span>
              </button>
            )
          })}
        <div className="rail-bottom">
          <button className="rail-item" aria-label="Help" title="Help · F1" onClick={openHelp}>
            <LifeBuoy size={20} />
            <span>Help</span>
          </button>
          <a
            className="rail-item"
            aria-label="Web"
            title="Open Web in a new tab"
            href={window.location.href}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={20} />
            <span>Web</span>
          </a>
          <button
            className={`rail-item ${page === 'settings' ? 'active' : ''}`}
            aria-label="Settings"
            aria-current={page === 'settings' ? 'page' : undefined}
            title="Settings · Alt+3"
            onClick={() => navigate('settings')}
          >
            <Settings size={20} strokeWidth={1.6} />
            <span>Settings</span>
          </button>
        </div>
      </nav>
      <aside className={`desktop-sidebar ${page === 'playground' ? 'playground-sidebar' : ''}`}>
        <header>
          <strong>{page === 'catalog' ? 'Models Hub' : page === 'playground' ? 'Workspace' : title}</strong>
          {page === 'playground' && (
            <button
              className="chat-icon-button"
              aria-label="Search conversations"
              title="Search conversations"
              onClick={() => {
                selectTask('chat')
                setTimeout(() => window.dispatchEvent(new Event('atomic:search-chats')), 0)
              }}
            >
              <Search size={17} />
            </button>
          )}
        </header>
        {page === 'server' ? (
          <ServerControlPanel
            workspace={workspace}
            selectSection={selectSection}
            openSetup={openSetup}
            prepared={prepared}
          />
        ) : null}
        <nav
          className="sidebar-sections"
          aria-label={
            page === 'server'
              ? 'Server sections'
              : page === 'catalog'
                ? 'Catalog sections'
                : page === 'settings'
                  ? 'Settings sections'
                  : 'Playground tasks'
          }
        >
          {items.map((item) => (
            <Fragment key={item.id}>
              {page === 'catalog' && item.id === 'catalog' && (
                <span className="sidebar-group-label">Discover</span>
              )}
              {page === 'settings' && item.id === 'assistants' && (
                <span className="sidebar-group-label">Workspace</span>
              )}
              <button
                key={item.id}
                className={(page === 'playground' ? task : section) === item.id ? 'active' : ''}
                aria-current={(page === 'playground' ? task : section) === item.id ? 'page' : undefined}
                onClick={() => {
                  if (page !== 'playground') return selectSection(item.id)
                  selectTask(item.id)
                  if (item.id === 'chat') window.dispatchEvent(new Event('atomic:new-chat'))
                }}
              >
                {(() => {
                  const Icon = sectionIcons[item.id as keyof typeof sectionIcons]
                  return Icon ? <Icon size={16} aria-hidden="true" /> : null
                })()}
                <span>{page === 'playground' && item.id === 'chat' ? 'New chat' : item.label}</span>
                {item.id === 'downloads' && Boolean(workspace.snapshot?.downloads.length) && (
                  <small>{workspace.snapshot?.downloads.length}</small>
                )}
              </button>
            </Fragment>
          ))}
        </nav>
        <div
          ref={historyContainerRef}
          className="desktop-chat-history"
          hidden={page !== 'playground' || task !== 'chat'}
        />
        {page === 'server' && (
          <div className="sidebar-agents">
            <p>Agents & tools</p>
            {CONNECTION_AGENTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => connectAgent(id)}
                title={prepared.includes(id) ? 'Connection prepared' : `Configure ${label}`}
              >
                <AgentIcon id={id} label={label} />
                <span>{label}</span>
                <i className={`agent-state ${prepared.includes(id) ? 'prepared' : ''}`} aria-hidden="true" />
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
