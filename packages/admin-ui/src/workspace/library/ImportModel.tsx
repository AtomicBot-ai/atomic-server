// Lifted from Atomic-Chat/web-app/src/containers/hub/ImportLocalFile.tsx @ 5043013; adapted: register an existing GGUF file on the server without uploading or copying it.
import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { modelImportError } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { useDialog } from '../useDialog'
import './import-model.css'

export function ImportModel({
  workspace,
  onClose,
  onImported,
}: {
  workspace: Workspace
  onClose: () => void
  onImported: () => void
}) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useDialog(() => {
    if (!busy) onClose()
  })
  const value = path.trim()
  const valid = /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(value) && /\.gguf$/i.test(value)
  return (
    <div className="wizard-overlay">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Import local model"
        tabIndex={-1}
        className="wizard import-model-dialog"
      >
        <div className="panel-heading">
          <h2>Import local model</h2>
          <Action ariaLabel="Close import" disabled={busy} onClick={onClose}>
            <X size={18} />
          </Action>
        </div>
        <p>Use a GGUF file already on the server. The file stays in its current location.</p>
        <Field label="Model file path">
          <input
            autoFocus
            disabled={busy}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/model.gguf"
          />
        </Field>
        {value && !valid && <p role="status">Enter the absolute path to a .gguf file.</p>}
        <div className="wizard-bottom">
          <Action disabled={busy} onClick={onClose}>
            Cancel
          </Action>
          <Action
            primary
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await workspace.execute('models.import', { path: value })
                await workspace.refresh()
                onImported()
              } catch (error) {
                throw new Error(modelImportError(error, describeError(error)))
              } finally {
                setBusy(false)
              }
            }}
          >
            <Upload size={16} />
            Import model
          </Action>
        </div>
      </section>
    </div>
  )
}
