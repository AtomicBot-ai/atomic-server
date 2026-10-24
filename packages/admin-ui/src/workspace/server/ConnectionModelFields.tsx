// Lifted from Atomic-Chat/web-app/src/containers/server-concept/EngineModelFields.tsx @ 5043013; adapted: compatible engines and pending model downloads.
import { Action } from '../Controls'
import { DetailPicker } from './DetailPicker'
import { engineChoice, modelChoice } from './model-choices'
import { text } from '../types'
import type { RecordValue } from '../types'

export function ConnectionModelFields({
  models,
  model,
  engine,
  providers,
  status,
  availability = 'known',
  selectModel,
  selectEngine,
  browse,
}: {
  models: RecordValue[]
  model: string
  engine: string
  providers: string[]
  status: string
  availability?: 'known' | 'checking' | 'unavailable'
  selectModel: (id: string) => void
  selectEngine: (id: string) => void
  browse: () => void
}) {
  const ready = models.some((m) => text(m.id ?? m.model_id) === model)
  const unknown = availability === 'checking' ? 'Checking…' : 'Status unavailable'
  return (
    <>
      <div className="server-engine-model">
        <DetailPicker
          label="Inference engine"
          value={engine}
          choices={providers.map(engineChoice)}
          placeholder="Choose a model first"
          onChange={selectEngine}
        />
        <DetailPicker
          label="Model"
          name="model"
          value={model}
          choices={[
            ...(model && !ready
              ? [modelChoice({ id: model }, availability === 'known' ? 'Not downloaded' : unknown)]
              : []),
            ...models.map((item) =>
              modelChoice(
                item,
                availability !== 'known' && text(item.id ?? item.model_id) === model ? unknown : 'Downloaded'
              )
            ),
          ]}
          placeholder="Choose a downloaded model"
          onChange={selectModel}
        />
      </div>
      <p className="connection-model-status" role="status">
        {status}
      </p>
      <Action primary={!model} onClick={browse}>
        Choose a local model
      </Action>
    </>
  )
}
