import type { Ref } from 'react'
import { Radio, X } from 'lucide-react'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { FloatingDownloads } from '../library/FloatingDownloads'
import { AgentIcon } from './AgentIcon'
import './connection-heading.css'

export function ConnectionHeading({
  workspace,
  step,
  agent,
  name,
  heading,
  onClose,
}: {
  workspace: Workspace
  step: string
  agent?: string
  name: string
  heading: Ref<HTMLHeadingElement>
  onClose: () => void
}) {
  const chosen = ['review', 'preparing', 'done'].includes(step)
  const title =
    step === 'choose'
      ? 'What would you like to connect?'
      : step === 'agent'
        ? 'Choose your agent'
        : step === 'endpoint'
          ? 'Create a local endpoint'
          : step === 'review'
            ? agent
              ? `Connect ${name}`
              : 'Review your endpoint'
            : step === 'done'
              ? agent
                ? `${name} connection is ready`
                : 'Your endpoint is ready'
              : 'Preparing your server'
  return (
    <header className="connection-heading">
      <div className="connection-identity">
        {chosen && (agent ? <AgentIcon id={agent} label={name} /> : <Radio size={40} aria-hidden="true" />)}
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
      </div>
      <FloatingDownloads workspace={workspace} />
      <Action ariaLabel="Close setup guide" disabled={step === 'preparing'} onClick={onClose}>
        <X size={18} />
      </Action>
    </header>
  )
}
