import { engineFamily } from '@view'
import type { Workspace } from '../../useWorkspace'
import { EngineBuilds } from './EngineBuilds'
import { EngineSetup } from './EngineSetup'
import { FoundryLocal } from './FoundryLocal'
import { LiteRtLm } from './LiteRtLm'
import { FastFlowLmPreparation } from './FastFlowLmPreparation'

/** Engine lifecycle and hardware readiness are separate from inference settings. */
export function EngineOverview({
  provider,
  workspace,
  onClose,
}: {
  provider: string
  workspace: Workspace
  onClose: () => void
}) {
  return (
    <div className="engine-overview">
      {engineFamily(provider) !== 'managed' && (
        <EngineBuilds provider={provider} execute={workspace.execute} snapshot={workspace.snapshot} />
      )}
      {provider === 'fastflowlm' && <FastFlowLmPreparation workspace={workspace} />}
      {engineFamily(provider) === 'managed' && (
        <EngineSetup workspace={workspace} engine={provider} onClose={onClose} embedded />
      )}
      {provider === 'foundry-local' && (
        <FoundryLocal workspace={workspace} onClose={onClose} embedded hardwareOnly />
      )}
      {provider === 'litert-lm' && <LiteRtLm workspace={workspace} onClose={onClose} embedded hardwareOnly />}
    </div>
  )
}
