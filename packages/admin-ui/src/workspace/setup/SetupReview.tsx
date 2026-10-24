import { engineDialog } from './setup-data'
import { FoundryModelInstall } from '../library/FoundryModelInstall'
import { LiteRtModelInstall } from '../library/LiteRtModelInstall'
import { ManagedModelInstall } from '../library/ManagedModelInstall'
import { ModelInstall } from '../library/ModelInstall'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'

/**
 * The review of the model chosen in setup, by the engine's format: a GGUF file (or a media model), a
 * managed engine's checkpoint (the core's verdicts, then the plan), or a Foundry Local or LiteRT-LM variant.
 * `onStarted` gets the download's id and the model id that loads once it is done (a variant's own id).
 */
export function SetupReview({
  workspace: w,
  model,
  category,
  engine,
  technical,
  onClose,
  onStarted,
  onEngine,
  autoStart,
}: {
  workspace: Workspace
  model: RecordValue
  category: string
  engine: string
  technical: boolean
  onClose: () => void
  onStarted: (id: string, model: string) => void | Promise<void>
  onEngine: (engine: string) => void
  autoStart?: boolean
}) {
  const kind = engineDialog(engine)
  if (kind === 'managed')
    return (
      <ManagedModelInstall
        workspace={w}
        repository={text(model.id)}
        onClose={onClose}
        onStarted={(id) => onStarted(id, text(model.id))}
        onInstallEngine={onEngine}
      />
    )
  if (kind === 'foundry')
    return (
      <FoundryModelInstall
        workspace={w}
        model={model.foundry as never}
        onClose={onClose}
        onStarted={onStarted}
        onFoundry={() => onEngine('foundry-local')}
      />
    )
  if (kind === 'litert')
    return (
      <LiteRtModelInstall
        workspace={w}
        model={model.litert as never}
        onClose={onClose}
        onStarted={onStarted}
        onEngine={() => onEngine('litert-lm')}
      />
    )
  return (
    <ModelInstall
      autoStart={autoStart}
      model={model}
      category={category}
      expectedEngine={engine}
      technical={technical}
      execute={w.execute}
      onClose={onClose}
      onStarted={(result) => {
        const job = result && typeof result === 'object' ? (result as RecordValue) : {}
        return onStarted(
          text(job.id ?? job.setup_id, ''),
          text(record(job.plan).model_id ?? job.model_id ?? model.id, '')
        )
      }}
    />
  )
}
