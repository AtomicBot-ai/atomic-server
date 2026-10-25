// Lifted from Atomic-Chat/web-app/src/components/left-sidebar/NavigationRail.tsx @ 807b4d9; adapted: shared support links and server controls.
import { Github, Mail, MessageCircle, X } from 'lucide-react'
import { useDialog } from './useDialog'
import './help-menu.css'

export function HelpMenu({
  onClose,
  onCommands,
  onSetup,
}: {
  onClose: () => void
  onCommands: () => void
  onSetup: () => void
}) {
  const dialog = useDialog(onClose)
  return (
    <div className="modal-shade support-shade">
      <section
        ref={dialog}
        className="support-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        tabIndex={-1}
      >
        <header>
          <h2>Help</h2>
          <button aria-label="Close Help" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <a href="mailto:support@atomic.chat">
          <Mail size={18} />
          Email support
        </a>
        <a href="https://discord.com/invite/FTk2MvZwJH" target="_blank" rel="noreferrer">
          <MessageCircle size={18} />
          Discord
        </a>
        <a href="https://github.com/AtomicBot-ai/Atomic-Chat/issues/new" target="_blank" rel="noreferrer">
          <Github size={18} />
          New GitHub issue
        </a>
        <hr />
        <button onClick={onSetup}>Setup guide</button>
        <button onClick={onCommands}>Commands</button>
      </section>
    </div>
  )
}
