/** Chat attachments: a file's text (`attachments.parse`) and the excerpt sent with a question (`attachments.prepare`). */
import { documentText } from '../../document-import/index.js'
import type { AttachmentSettings, WorkspaceInput } from '../../contract/index.js'
import { requireAttachments } from './attachment-processing.js'
import { prepareAttachment, type EmbedDocuments } from './embedding-retrieval.js'

/** `settings` as stored: parsing is refused unless attachments are enabled there. */
export async function parseAttachment(settings: AttachmentSettings, input: WorkspaceInput) {
  requireAttachments(settings)
  return {
    name: String(input['name']),
    content: await documentText(
      String(input['name']),
      Buffer.from(String(input['data']), 'base64'),
      settings.max_file_size_mb
    ),
  }
}

/** `settings` merged with their defaults. */
export function prepareAttachmentInput(
  settings: AttachmentSettings,
  input: WorkspaceInput,
  embed: EmbedDocuments | undefined
) {
  return prepareAttachment(
    settings,
    String(input['name']),
    String(input['content']),
    String(input['query'] ?? ''),
    embed
  )
}
