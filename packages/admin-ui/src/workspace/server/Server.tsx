// Lifted from Atomic-Chat/web-app/src/containers/server-concept/ServerExperience.tsx @ 5043013; adapted: server operations and shared workspace navigation.
import { useState } from 'react'
import { SERVER_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { Connections } from './Connections'
import { ConnectionGuide } from './ConnectionGuide'
import { ServerConfiguration } from './ServerConfiguration'
import { RemoteAccess } from './RemoteAccess'
import { ServerModel } from './ServerModel'
import { Activity } from './Activity'
import { ServerKeys } from './ServerKeys'
import { ServerOverview } from './ServerOverview'
import { RuntimeSettings } from './RuntimeSettings'

export function Server({
  workspace,
  openCommand,
  openSetup,
  section,
  onSection,
  openSettings = () => {},
  openModels = () => {},
  initialAgent,
  showGuide = false,
  closeGuide = () => {},
  connectAgent,
  prepared = [],
  onPrepared,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  openSetup: () => void
  section?: string
  onSection?: (section: string) => void
  openSettings?: () => void
  openModels?: () => void
  initialAgent?: string
  showGuide?: boolean
  closeGuide?: () => void
  connectAgent?: (id: string) => void
  prepared?: string[]
  onPrepared?: (id: string) => void
}) {
  const [localSection, setLocalSection] = useState('overview')
  const [localAgent, setLocalAgent] = useState<string>()
  const [localGuide, setLocalGuide] = useState(false)
  const [guideReturn, setGuideReturn] = useState('overview')
  const view = section ?? localSection
  const setView = onSection ?? setLocalSection
  const guide = showGuide || localGuide
  const connect =
    connectAgent ??
    ((id: string) => {
      setGuideReturn(view)
      setLocalAgent(id)
      setLocalGuide(true)
      setView('overview')
    })
  const setup = () => {
    if (connectAgent) openSetup()
    else {
      setGuideReturn(view)
      setLocalAgent(undefined)
      setLocalGuide(true)
      setView('overview')
    }
  }
  return (
    <div className="server-page server-desktop">
      {view !== 'overview' && (
        <div className="page-heading">
          <h1>{SERVER_SECTIONS.find((s) => s.id === view)?.label ?? 'Server'}</h1>
          <Action onClick={setup}>Guide me</Action>
        </div>
      )}
      {!section && (
        <nav className="subnav" aria-label="Server sections">
          {SERVER_SECTIONS.map(({ id, label }) => (
            <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      {view === 'overview' && (
        <>
          {guide && (
            <ConnectionGuide
              key={initialAgent ?? localAgent ?? 'choose'}
              workspace={workspace}
              initialAgent={initialAgent ?? localAgent}
              onClose={() => {
                if (localGuide) setView(guideReturn)
                setLocalGuide(false)
                closeGuide()
              }}
              onSettings={openSettings}
              onPrepared={onPrepared}
            />
          )}
          <ServerOverview
            workspace={workspace}
            openSetup={setup}
            connectAgent={connect}
            openConnections={() => setView('connect')}
            showGuide={guide}
            prepared={prepared}
          />
        </>
      )}
      {view === 'connect' && (
        <Connections
          workspace={workspace}
          openCommand={openCommand}
          openSetup={setup}
          connectAgent={connect}
          openKeys={() => setView('keys')}
          prepared={prepared}
        />
      )}
      {view === 'configuration' && (
        <ServerConfiguration workspace={workspace} openKeys={() => setView('keys')} />
      )}
      {view === 'model' && <ServerModel workspace={workspace} openModels={openModels} />}
      {view === 'remote' && <RemoteAccess workspace={workspace} />}
      {view === 'proxy' && <RuntimeSettings workspace={workspace} section="proxy" />}
      {view === 'traffic' && <Activity workspace={workspace} />}
      {view === 'keys' && <ServerKeys workspace={workspace} />}
    </div>
  )
}
