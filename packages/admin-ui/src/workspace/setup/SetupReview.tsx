import { ENGINE_DIALOG } from './setup-data'
import { FoundryModelInstall } from '../library/FoundryModelInstall'
import { ManagedModelInstall } from '../library/ManagedModelInstall'
import { ModelInstall } from '../library/ModelInstall'
import { text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'

/**
 * The review of the model chosen in setup, by the engine's format: a GGUF file (or a media model), a
 * managed engine's checkpoint (the core's verdicts, then the plan), or a Foundry Local variant.
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
}: {
  workspace: Workspace
  model: RecordValue
  category: string
  engine: string
  technical: boolean
  onClose: () => void
  onStarted: (id: string) => void
  onEngine: (engine: string) => void
}) {
  const kind = ENGINE_DIALOG[engine]
  if (kind === 'managed')
    return (
      <ManagedModelInstall
        workspace={w}
        repository={text(model.id)}
        onClose={onClose}
        onStarted={onStarted}
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
  return (
    <ModelInstall
      model={model}
      category={category}
      expectedEngine={engine}
      technical={technical}
      execute={w.execute}
      onClose={onClose}
      onStarted={(result) => {
        const job = result && typeof result === 'object' ? (result as RecordValue) : {}
        onStarted(text(job.id ?? job.setup_id, ''))
      }}
    />
  )
}
