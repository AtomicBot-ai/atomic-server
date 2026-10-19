import { Fragment, useEffect, useState } from 'react'
import { PLAYGROUND_TASKS, WORKSPACE_NAVIGATION, SETUP_GOALS } from '@contract'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useStatusStore } from '@/stores/status-store'
import { useWorkspace } from './useWorkspace'
import { Cockpit } from './Cockpit'
import { Server } from './server/Server'
import { Catalog } from './library/Catalog'
import { Chat } from './chat/Chat'
import { Media } from './media/Media'
import { CommandDock } from './CommandDock'
import { SetupWizard } from './setup/SetupWizard'
import { Action } from './Controls'
import type { Page } from './types'
import './styles/workspace.css'

export function WorkspaceApp() {
  const workspace = useWorkspace()
  const hub = useServiceHub()
  const [page, setPage] = useState<Page>('server')
  const [task, setTask] = useState('chat')
  const [command, setCommand] = useState<string | null>(null)
  const [wizard, setWizard] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [help, setHelp] = useState(false)
  const openWizard = wizard || Boolean(workspace.snapshot && !workspace.snapshot.setup && !setupDismissed)
  useEffect(() => {
    // Keep the first-run wizard mounted when verification saves setup.complete,
    // so its Ready screen and goal-specific next action remain visible.
    if (workspace.snapshot && !workspace.snapshot.setup && !setupDismissed) setWizard(true)
  }, [workspace.snapshot, setupDismissed])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault()
        setCommand((current) => (current ? null : 'api.ping'))
      } else if (e.key === 'F1') {
        e.preventDefault()
        setHelp((value) => !value)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPage('playground')
        setTask('chat')
        window.dispatchEvent(new Event('atomic:new-chat'))
      } else if (e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        setPage(WORKSPACE_NAVIGATION[Number(e.key) - 1].id)
      } else if (e.key === 'Escape') {
        setCommand(null)
        setHelp(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="eye-workspace">
      <Cockpit workspace={workspace} navigate={setPage} />
      <div className="workspace-nav">
        <nav aria-label="Main">
          {WORKSPACE_NAVIGATION.map((item, index) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              title={`Alt+${index + 1}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ew-actions">
          <button className="ew-button" onClick={() => setCommand('operations.list')} title="Commands · F4">
            Commands
          </button>
          <Action
            onClick={async () => {
              await hub.session().logout()
              useStatusStore.getState().reset()
              useStatusStore.setState({ unauthorized: true })
            }}
          >
            Sign out
          </Action>
        </div>
      </div>
      {workspace.error && (
        <div className="ew-error connection-error" role="alert">
          <span>{workspace.error}</span>
          <Action onClick={workspace.refresh}>Retry</Action>
        </div>
      )}
      <main className={`workspace-content ${page === 'playground' && task === 'chat' ? 'chat-page' : ''}`}>
        {page === 'server' && (
          <Server workspace={workspace} openCommand={setCommand} openSetup={() => setWizard(true)} />
        )}
        {page === 'catalog' && <Catalog workspace={workspace} openCommand={setCommand} />}
        {page === 'playground' && (
          <>
            <div className="playground-nav">
              <label>
                Task{' '}
                <select value={task} onChange={(e) => setTask(e.target.value)}>
                  {PLAYGROUND_TASKS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {task === 'chat' ? (
              <Chat workspace={workspace} onCatalog={() => setPage('catalog')} />
            ) : (
              <Media key={task} workspace={workspace} task={task} openCommand={setCommand} />
            )}
          </>
        )}
      </main>
      {command && (
        <CommandDock
          key={command}
          operations={workspace.operations}
          execute={workspace.execute}
          selected={command}
          onClose={() => setCommand(null)}
        />
      )}
      <footer className="command-footer">
        <button onClick={() => setHelp((value) => !value)}>F1 Help</button>
        <span>|</span>
        {WORKSPACE_NAVIGATION.map((item, index) => (
          <Fragment key={item.id}>
            <button onClick={() => setPage(item.id)}>
              Alt+{index + 1} {item.label}
            </button>
            <span>|</span>
          </Fragment>
        ))}
        <button onClick={() => setCommand((current) => (current ? null : 'api.ping'))}>F4 Commands</button>
        {page === 'playground' && task === 'chat' && (
          <>
            <span>|</span>
            <button onClick={() => window.dispatchEvent(new Event('atomic:new-chat'))}>
              Ctrl+N New chat
            </button>
            <span>|</span>
            <span>Enter Send | Shift+Enter New line</span>
          </>
        )}
      </footer>
      {help && (
        <div className="help-popover">
          <div className="panel-heading">
            <h2>Controls</h2>
            <button onClick={() => setHelp(false)}>Close</button>
          </div>
          <p>Click any control, or use Tab to move and Enter to activate it.</p>
          <p>F4 opens the command list. Escape closes it. Alt+1 / 2 / 3 switches pages.</p>
          <p>Closing this page leaves the server running.</p>
          <Action
            onClick={() => {
              setHelp(false)
              setWizard(true)
            }}
          >
            Setup wizard
          </Action>
        </div>
      )}
      {openWizard && (
        <SetupWizard
          workspace={workspace}
          onOpenGoal={(id) => {
            const goal = SETUP_GOALS.find((item) => item.id === id)
            setWizard(false)
            setSetupDismissed(true)
            setPage(goal?.destination ?? 'server')
            setTask(goal?.task ?? 'chat')
          }}
          onClose={() => {
            setWizard(false)
            setSetupDismissed(true)
            setPage('server')
          }}
        />
      )}
    </div>
  )
}
