import { engineFamily } from '@view'
import type { Workspace } from '../useWorkspace'
import { EngineSetup } from '../library/engines/EngineSetup'
import { EngineSettings } from '../library/engines/EngineSettings'
import { FoundryLocal } from '../library/engines/FoundryLocal'
import { LiteRtLm } from '../library/engines/LiteRtLm'

/** Return to the model review and recheck compatibility after its engine panel closes. */
export function SetupEngineDialog({
  workspace,
  engine,
  onClose,
}: {
  workspace: Workspace
  engine: string
  onClose: () => void
}) {
  if (engineFamily(engine) === 'managed')
    return (
      <EngineSetup
        workspace={workspace}
        engine={engine}
        onClose={onClose}
        onContinue={async () => {
          await workspace.refresh()
          onClose()
        }}
      />
    )
  if (engine === 'foundry-local') return <FoundryLocal workspace={workspace} onClose={onClose} />
  if (engine === 'litert-lm') return <LiteRtLm workspace={workspace} onClose={onClose} />
  return <EngineSettings workspace={workspace} provider={engine} onClose={onClose} />
}
