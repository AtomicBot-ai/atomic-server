import { useState } from 'react'
import { Action } from '../Controls'
import { useDialog } from '../useDialog'
export function DeleteConfirmation({
  title,
  name,
  detail,
  confirm,
  cancel = 'Keep it',
  busy = false,
  onClose,
  onConfirm,
}: {
  title: string
  name: string
  detail: string
  confirm: string
  cancel?: string
  busy?: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
}) {
  const [pending, setPending] = useState(false)
  const locked = busy || pending
  const close = () => {
    if (!locked) onClose()
  }
  const ref = useDialog(close)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={locked || undefined}
        tabIndex={-1}
      >
        <h2>{title}</h2>
        <strong>{name}</strong>
        <p>{detail}</p>
        <div className="ew-actions">
          <Action disabled={locked} onClick={close}>
            {cancel}
          </Action>
          <Action
            danger
            disabled={locked}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setPending(false)
              }
            }}
          >
            {confirm}
          </Action>
        </div>
      </section>
    </div>
  )
}
