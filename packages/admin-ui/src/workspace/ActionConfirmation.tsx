import { useRef, useState, type ReactNode } from 'react'
import { Action } from './Controls'
import { useDialog } from './useDialog'

/** Compact confirmation for interrupting actions; failures stay in the dialog for retry. */
export function ActionConfirmation({
  title,
  children,
  actionLabel,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string
  children?: ReactNode
  actionLabel: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
  danger?: boolean
}) {
  const running = useRef(false)
  const [pending, setPending] = useState(false)
  const close = () => {
    if (!running.current) onClose()
  }
  const ref = useDialog(close)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal"
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={pending || undefined}
        tabIndex={-1}
      >
        <h2>{title}</h2>
        {children}
        <div className="ew-actions">
          <Action disabled={pending} onClick={close}>
            Cancel
          </Action>
          <Action
            primary={!danger}
            danger={danger}
            disabled={pending}
            onClick={async () => {
              if (running.current) return
              running.current = true
              setPending(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                running.current = false
                setPending(false)
              }
            }}
          >
            {actionLabel}
          </Action>
        </div>
      </section>
    </div>
  )
}
