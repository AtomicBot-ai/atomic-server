import { fileData } from '../file-data'
import { useRef, useState } from 'react'
import { Paperclip, FileText, X } from 'lucide-react'
import { DEFAULT_ATTACHMENTS, type WorkspaceFeatures } from '@contract'
import { workspaceApi } from '../workspace-api'
import { attachmentImage } from './attachment-image'
export interface Attachment {
  name: string
  text?: string
  image?: string
}
export function ChatAttachments({
  attachments,
  setAttachments,
  disabled,
  vision,
}: {
  attachments: Attachment[]
  setAttachments: (v: Attachment[]) => void
  disabled: boolean
  vision: boolean
}) {
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="chat-attachments">
      <button
        className="chat-attach-button"
        type="button"
        disabled={disabled}
        title="Attach files"
        aria-label="Attach files"
        onClick={() => input.current?.click()}
      >
        <Paperclip size={18} />
      </button>
      <input
        ref={input}
        aria-label="Choose attachments"
        className="chat-file-input"
        type="file"
        multiple
        disabled={disabled}
        accept={`${vision ? 'image/png,image/jpeg,image/webp,' : ''}.txt,.md,.csv,.json,.log,.py,.js,.ts,.html,.css,.xml,.yaml,.yml,.pdf,.docx,.xlsx,.pptx`}
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          try {
            if (files.length + attachments.length > 5)
              throw new Error('Attach at most five files per message.')
            const features = await workspaceApi.execute<WorkspaceFeatures>('features.get')
            const settings = features?.attachments ?? DEFAULT_ATTACHMENTS
            const next: Attachment[] = []
            for (const file of files) {
              if (file.size > settings.max_file_size_mb * 1024 * 1024)
                throw new Error(`Attachments must be below ${settings.max_file_size_mb} MB.`)
              if (/^image\/(png|jpeg|webp)$/.test(file.type) && vision) {
                const image = await attachmentImage(file, settings.max_image_size_px)
                next.push({ name: file.name, image })
              } else {
                if (!settings.enabled) throw new Error('Enable document attachments in Settings first.')
                const parsed = await workspaceApi.execute<{ content: string }>('attachments.parse', {
                  name: file.name,
                  data: await fileData(file),
                })
                const text = parsed.content
                next.push({ name: file.name, text })
              }
            }
            setAttachments([...attachments, ...next])
            setError('')
          } catch (e) {
            setError(String(e))
          }
        }}
      />
      {!!attachments.length && (
        <div className="chat-attachment-chips">
          {attachments.map((file, i) => (
            <div className="chat-attachment-chip" key={i}>
              {file.image ? <img src={file.image} alt="" /> : <FileText size={16} />}
              <span>{file.name}</span>
              <button
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => setAttachments(attachments.filter((_, n) => n !== i))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
