// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Overview.tsx @ 5043013; adapted: actual server state and agent handoffs.
import { useState } from 'react'
import { ArrowRight, ChevronDown, CircleHelp, Network, Search } from 'lucide-react'
import { CONNECTION_AGENTS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { AgentIcon } from './AgentIcon'
import { AGENT_DESCRIPTIONS } from './agent-descriptions'
import { Activity } from './Activity'

export function ServerOverview({
  workspace,
  openSetup,
  connectAgent,
  openConnections,
  showGuide = false,
  prepared = [],
}: {
  workspace: Workspace
  openSetup: () => void
  connectAgent: (id: string) => void
  openConnections: () => void
  showGuide?: boolean
  prepared?: string[]
}) {
  const [query, setQuery] = useState('')
  const visible = CONNECTION_AGENTS.filter((agent) =>
    `${agent.label} ${AGENT_DESCRIPTIONS[agent.id] ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      {!showGuide && (
        <div className="server-ready-strip">
          <strong>Connect your tools to local models</strong>
          <Action onClick={openSetup}>
            <CircleHelp size={15} />
            Guide me
          </Action>
        </div>
      )}
      <section className="server-agents" aria-label="Agents & tools">
        <div className="server-section-heading">
          <h2>Agents & tools</h2>
          <label className="server-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search agents"
              placeholder="Search agents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="server-tools-grid">
          {visible.map((agent) => (
            <article
              key={agent.id}
              className={`server-tool ${prepared.includes(agent.id) ? 'is-prepared' : ''}`}
            >
              <div className="server-tool-heading">
                <AgentIcon id={agent.id} label={agent.label} />
                <h3>{agent.label}</h3>
              </div>
              <p>{AGENT_DESCRIPTIONS[agent.id]}</p>
              <Action
                onClick={() => (prepared.includes(agent.id) ? openConnections() : connectAgent(agent.id))}
              >
                {prepared.includes(agent.id) ? 'Connection prepared' : 'Configure'}
                <ArrowRight size={14} />
              </Action>
            </article>
          ))}
        </div>
        {!visible.length && <p className="ew-empty">No tools match “{query}”.</p>}
        <button className="server-endpoint-shortcut" onClick={openSetup}>
          <Network size={20} />
          <span>
            <strong>Connecting your own application?</strong>
            <small>Create an OpenAI-compatible endpoint.</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </section>
      <details className="server-activity">
        <summary>
          Server activity & logs
          <ChevronDown size={16} />
        </summary>
        <Activity workspace={workspace} />
      </details>
    </>
  )
}
