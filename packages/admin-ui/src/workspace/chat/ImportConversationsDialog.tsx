import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { ActionConfirmation } from '../ActionConfirmation'
import { workspaceApi } from '../workspace-api'
import type { RecordValue } from '../types'

export function ImportConversationsDialog({
  conversations,
  onImported,
  onClose,
}: {
  conversations: unknown[]
  onImported: (result: RecordValue) => Promise<void>
  onClose: () => void
}) {
  const imported = useRef<RecordValue | null>(null)
  const dialog = (
    <ActionConfirmation
      title={`Import ${conversations.length} conversation${conversations.length === 1 ? '' : 's'}?`}
      actionLabel="Import"
      onClose={onClose}
      onConfirm={async () => {
        // Keep the result if refreshing fails so retry does not create another set of copies.
        imported.current ??= await workspaceApi.execute<RecordValue>('history.import', { conversations })
        await onImported(imported.current)
      }}
    >
      <p>Conversations will be added as new copies. Existing chats will be kept.</p>
    </ActionConfirmation>
  )
  // History lives in the collapsible sidebar; its modal must survive that sidebar being hidden.
  return createPortal(dialog, document.querySelector('.desktop-workspace') ?? document.body)
}
