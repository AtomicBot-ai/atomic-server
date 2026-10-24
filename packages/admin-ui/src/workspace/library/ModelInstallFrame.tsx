import type { ReactNode } from 'react'
import { useDialog } from '../useDialog'

type Props = {
  embedded?: boolean
  pending?: boolean
  title: string
  onClose: () => void
  children: ReactNode
}
/** Catalog controls stay in their row; setup can use the same controls in a dialog. */
export function ModelInstallFrame({ embedded, ...props }: Props) {
  return embedded ? <div className="model-install-options">{props.children}</div> : <ModalFrame {...props} />
}

function ModalFrame({ title, onClose, children, pending }: Props) {
  const dialog = useDialog(onClose)
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${title}`}
      >
        <div className="panel-heading">
          <h2>{title}</h2>
          <button className="ew-button" disabled={pending} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
