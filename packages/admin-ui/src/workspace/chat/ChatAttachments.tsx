import { useState } from 'react'
import { Field } from '../Controls'
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
  return (
    <details className="chat-attachments">
      <summary>
        Attach text{vision ? ' or images' : ''}
        {attachments.length ? ` (${attachments.length})` : ''}
      </summary>
      <Field label="Choose attachments">
        <input
          type="file"
          multiple
          disabled={disabled}
          accept={`${vision ? 'image/png,image/jpeg,image/webp,' : ''}.txt,.md,.csv,.json,.log,.py,.js,.ts,.html,.css`}
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            try {
              if (files.length + attachments.length > 5)
                throw new Error('Attach at most five files per message.')
              const next: Attachment[] = []
              for (const file of files) {
                if (file.size > (file.type.startsWith('image/') ? 10 * 1024 * 1024 : 1024 * 1024))
                  throw new Error('Images must be below 10 MB; text files below 1 MB.')
                if (/^image\/(png|jpeg|webp)$/.test(file.type) && vision) {
                  const image = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onerror = () => reject(new Error('Could not read image.'))
                    reader.onload = () => resolve(String(reader.result))
                    reader.readAsDataURL(file)
                  })
                  next.push({ name: file.name, image })
                } else {
                  if (!/\.(txt|md|csv|json|log|py|js|ts|html|css)$/i.test(file.name))
                    throw new Error(
                      'Choose a text file, or a supported image with a vision model. Convert PDFs to text before attaching.'
                    )
                  const text = await file.text()
                  if (text.includes('\0')) throw new Error('This file contains binary data.')
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
      </Field>
      {attachments.map((file, i) => (
        <div className="attachment" key={i}>
          {file.name}
          <button disabled={disabled} onClick={() => setAttachments(attachments.filter((_, n) => n !== i))}>
            Remove {file.name}
          </button>
        </div>
      ))}
      {!vision && (
        <small>Image input is available only when the selected engine reports vision support.</small>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}
