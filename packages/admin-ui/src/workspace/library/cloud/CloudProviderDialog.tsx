// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 5043013; adapted: shared provider dialog for the catalog and first run.
import type { ReactNode } from 'react'
import { useDialog } from '../../useDialog'

type ProviderPanelProps = {
  name: string
  checking: boolean
  onClose: () => void
  children: ReactNode
}

export function CloudProviderDialog({ name, checking, onClose, children }: ProviderPanelProps) {
  const ref = useDialog(() => {
    if (!checking) onClose()
  })
  return (
    <div className="cloud-provider-overlay">
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
