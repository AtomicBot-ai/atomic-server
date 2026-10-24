// Lifted from Atomic-Chat/web-app/src/containers/server-concept/EngineModelFields.tsx @ 5043013; adapted: available engines and installed models from the server.
import { watchSharedRead } from '../watch-shared-read'
import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { DetailPicker } from './DetailPicker'
import { engineChoice, modelChoice } from './model-choices'
import { useEngines } from '../useEngines'
import { rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'

const providers = (model: RecordValue) =>
  Array.isArray(model.providers) ? model.providers.map(String) : [text(model.provider, '')].filter(Boolean)
export function ServerModel({ workspace: w, openModels }: { workspace: Workspace; openModels: () => void }) {
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [engine, setEngine] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const { execute } = w
  const { engines, error: engineError } = useEngines(execute)
  const current = w.snapshot?.services.find(
    (item) => item.kind === 'chat' && ['ready', 'loaded', 'running'].includes(item.state)
  )
  useEffect(
    () =>
      watchSharedRead(
        () => execute('models.installed'),
        (value) => {
          setInstalled(rows(value))
          setLoading(false)
          setError('')
        },
        (e) => {
          setError(describeError(e))
          setLoading(false)
        }
      ),
    [execute]
  )
  const availableEngines = [
    ...new Set([...engines.map((item) => text(item.engine, '')), ...installed.flatMap(providers)]),
  ].filter(Boolean)
  const selectedEngine = engine || current?.provider || availableEngines[0] || ''
  const compatible = installed.filter((item) => providers(item).includes(selectedEngine))
  const selectedModel = compatible.some((item) => text(item.id ?? item.model_id) === model)
    ? model
    : compatible.some((item) => text(item.id ?? item.model_id) === current?.model)
      ? current!.model
      : text(compatible[0]?.id ?? compatible[0]?.model_id, '')
  const loaded = w.snapshot?.services.some(
    (item) =>
      item.model === selectedModel &&
      item.provider === selectedEngine &&
      ['ready', 'loaded', 'running'].includes(item.state)
  )
  return (
    <section className="server-settings server-model-settings" aria-label="Engine and model settings">
      {(error || engineError) && <p role="alert">{error || engineError}</p>}
      {loading ? (
        <p role="status">Loading models…</p>
      ) : (
        <>
          <fieldset className="server-settings-panel" disabled={applying}>
            <div className="server-engine-model">
              <DetailPicker
                label="Inference engine"
                value={selectedEngine}
                choices={availableEngines.map(engineChoice)}
                placeholder="No engines available"
                disabled={applying}
                onChange={(value) => {
                  setEngine(value)
                  setModel('')
                  setNotice('')
                }}
              />
              <DetailPicker
                label="Model"
                name="model"
                value={selectedModel}
                choices={compatible.map((item) => modelChoice(item))}
                placeholder="No downloaded models for this engine"
                disabled={applying}
                onChange={(value) => {
                  setModel(value)
                  setNotice('')
                }}
              />
            </div>
            <div className="ew-actions">
              <Action primary={!compatible.length} onClick={openModels}>
                Browse models
              </Action>
              {loaded && <span className="server-state-tag">Loaded</span>}
            </div>
          </fieldset>
          {!loaded && selectedModel && (
            <div className="server-save-bar">
              <span>Apply engine and model</span>
              <Action
                disabled={applying}
                onClick={() => {
                  setEngine('')
                  setModel('')
                  setNotice('')
                }}
              >
                Discard
              </Action>
              <Action
                primary
                onClick={async () => {
                  setApplying(true)
                  try {
                    await execute('models.load', { provider: selectedEngine, model_id: selectedModel })
                    setEngine('')
                    setModel('')
                    setNotice('Model loaded.')
                    await w.refresh()
                  } finally {
                    setApplying(false)
                  }
                }}
              >
                Load model
              </Action>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  )
}
