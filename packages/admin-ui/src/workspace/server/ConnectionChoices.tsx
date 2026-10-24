// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Setup.tsx @ 5043013; adapted: real server choices and bundled agent marks.
import { ArrowRight, Bot, Network } from 'lucide-react'
import { CONNECTION_AGENTS } from '@contract'
import { Action } from '../Controls'
import { AgentIcon } from './AgentIcon'
import { AGENT_DESCRIPTIONS } from './agent-descriptions'
import './connection-choices.css'

export function ConnectionChoices({
  choose,
  manual,
}: {
  choose: (path: 'agent' | 'endpoint') => void
  manual: () => void
}) {
  return (
    <>
      <div className="intent-grid connection-choice-grid">
        <button className="intent-card" onClick={() => choose('agent')}>
          <Bot aria-hidden="true" />
          <strong>Configure an agent</strong>
          <span>Connect a coding assistant.</span>
          <ArrowRight className="connection-choice-arrow" size={18} />
        </button>
        <button className="intent-card" onClick={() => choose('endpoint')}>
          <Network aria-hidden="true" />
          <strong>Configure an endpoint</strong>
          <span>Serve an API for your app.</span>
          <ArrowRight className="connection-choice-arrow" size={18} />
        </button>
      </div>
      <button className="connection-manual" onClick={manual}>
        I’ll set it up myself
      </button>
    </>
  )
}

export function AgentChoices({
  more,
  toggle,
  select,
}: {
  more: boolean
  toggle: () => void
  select: (id: string) => void
}) {
  return (
    <>
      <div className="intent-grid connection-agent-grid">
        {CONNECTION_AGENTS.slice(0, more ? undefined : 3).map((agent) => (
          <button
            key={agent.id}
            className="intent-card"
            aria-label={agent.label}
            onClick={() => select(agent.id)}
          >
            <AgentIcon id={agent.id} label={agent.label} />
            <strong>{agent.label}</strong>
            <span>{AGENT_DESCRIPTIONS[agent.id]}</span>
            <ArrowRight className="connection-choice-arrow" size={16} />
          </button>
        ))}
      </div>
      <Action onClick={toggle}>{more ? 'Fewer agents' : 'More agents & tools'}</Action>
    </>
  )
}
