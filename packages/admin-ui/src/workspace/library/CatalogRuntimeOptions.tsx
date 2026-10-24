// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: inline server engine compatibility and Foundry variants.
import { useState } from 'react'
import type { Workspace } from '../useWorkspace'
import type { RecordValue } from '../types'
import { record, rows } from '../types'
import { Action } from '../Controls'
import { describeError } from '@/services/admin-api'
import { ManagedModelInstall } from './ManagedModelInstall'
import { FoundryModelInstall } from './FoundryModelInstall'
import { EngineSetup } from './EngineSetup'
import { FoundryLocal } from './FoundryLocal'
import { modelId } from './catalog-models'

export function CatalogRuntimeOptions({
  workspace,
  model,
  onStarted,
}: {
  workspace: Workspace
  model: RecordValue
  onStarted?: () => void
}) {
  const [engine, setEngine] = useState('')
  const [foundry, setFoundry] = useState(false)
  const [revision, setRevision] = useState(0)
  const [currentFoundry, setCurrentFoundry] = useState(record(model.foundry))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const refreshVariants = async () => {
    setRefreshing(true)
    setError('')
    try {
      const result = await workspace.execute('models.search', {
        engine: 'foundry-local',
        query: modelId(model),
      })
      const next = rows(result).find((candidate) => candidate.model_id === modelId(model))
      if (!next) throw new Error('This model is no longer in the Foundry catalog.')
      setCurrentFoundry(next)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setRefreshing(false)
    }
  }
  return (
    <>
      {model.foundry ? (
        <>
          {refreshing && <p role="status">Checking variants…</p>}
          {error && (
            <p role="alert">
              {error} <Action onClick={refreshVariants}>Retry</Action>
            </p>
          )}
          <FoundryModelInstall
            embedded
            workspace={workspace}
            model={currentFoundry as never}
            onClose={() => {}}
            onStarted={onStarted}
            onFoundry={() => setFoundry(true)}
          />
        </>
      ) : (
        <ManagedModelInstall
          embedded
          workspace={workspace}
          repository={modelId(model)}
          revision={revision}
          onClose={() => {}}
          onStarted={onStarted}
          onInstallEngine={setEngine}
        />
      )}
      {engine && (
        <EngineSetup
          workspace={workspace}
          engine={engine}
          onClose={() => {
            setEngine('')
            setRevision((value) => value + 1)
          }}
        />
      )}
      {foundry && (
        <FoundryLocal
          workspace={workspace}
          onClose={() => {
            setFoundry(false)
            void refreshVariants()
          }}
        />
      )}
    </>
  )
}
