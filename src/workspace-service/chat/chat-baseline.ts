import type { Conversation } from '../../terminal-data/index.js'
import type { WorkspaceInput } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { object } from '../validation.js'

/** Explicit revisions permit edits/regeneration; older clients may only append to the current history. */
export function chatBaseline(chat: Conversation | null, input: WorkspaceInput, messages: unknown[]): number {
  if (input['conversation_id'] && !chat)
    throw new AtcError('ATC_USAGE', 'This conversation was deleted. Start a new chat.')
  const revision = chat?.revision ?? 0
  if (input['expected_revision'] !== undefined) {
    if (input['expected_revision'] !== revision)
      throw new AtcError(
        'ATC_USAGE',
        'This conversation changed in another client. Reopen it before retrying; your draft has been kept.'
      )
  } else if (chat) {
    const wire = (message: unknown) => {
      const { atomic_meta: _meta, ...rest } = object(message)
      return rest
    }
    if (
      !chat.messages.every(
        (message, i) => JSON.stringify(wire(message)) === JSON.stringify(wire(messages[i]))
      )
    )
      throw new AtcError(
        'ATC_USAGE',
        'This conversation changed. Reopen it before retrying or provide expected_revision to edit it.'
      )
  }
  return revision
}
