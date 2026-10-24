// Lifted from Atomic-Chat preview/onboarding/Onboarding.tsx @ 5043013; adapted: inline onboarding credentials and compact library dialogs.
import { useEffect, useRef, type ReactNode } from 'react'
import { useDialog } from '../useDialog'

type ProviderPanelProps = {
  name: string
  checking: boolean
  onClose: () => void
  children: ReactNode
}

export function CloudProviderDialog(props: ProviderPanelProps & { inline?: boolean }) {
  return props.inline ? <InlineProviderPanel {...props} /> : <ProviderModal {...props} />
}

function InlineProviderPanel({ name, children }: ProviderPanelProps) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (document.activeElement?.closest('.cloud-provider-card'))
      ref.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [name])
  return (
    <section ref={ref} className="cloud-provider-inline" aria-label={`Connect ${name}`}>
      {children}
    </section>
  )
}

function ProviderModal({ name, checking, onClose, children }: ProviderPanelProps) {
  const ref = useDialog(() => {
    if (!checking) onClose()
  })
  return (
    <div
      className="cloud-provider-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !checking) onClose()
      }}
    >
      <section
        ref={ref}
        className="cloud-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${name}`}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  )
}
