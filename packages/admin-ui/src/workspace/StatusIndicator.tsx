import type { ReactNode } from 'react'
import './status-indicator.css'

/** A state label, never an action: no button surface, hover treatment or focus stop. */
export function StatusIndicator({
  children,
  tone = 'neutral',
  pending = false,
}: {
  children: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'negative'
  pending?: boolean
}) {
  return (
    <span className="status-indicator" data-tone={tone}>
      <span className={`status-indicator-mark${pending ? ' pending' : ''}`} aria-hidden="true" />
      {children}
    </span>
  )
}
