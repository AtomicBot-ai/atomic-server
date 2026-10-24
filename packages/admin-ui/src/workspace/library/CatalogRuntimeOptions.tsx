// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: inline server engine compatibility and Foundry Local and LiteRT-LM variants.
import { useState } from 'react'
import type { Workspace } from '../useWorkspace'
import type { RecordValue } from '../types'
import { record, rows } from '../types'
import { Action } from '../Controls'
import { describeError } from '@/services/admin-api'
import { ManagedModelInstall } from './ManagedModelInstall'
import { FoundryModelInstall } from './FoundryModelInstall'
import { LiteRtModelInstall } from './LiteRtModelInstall'
import { EngineSetup } from './EngineSetup'
import { FoundryLocal } from './FoundryLocal'
import { LiteRtLm } from './LiteRtLm'
import { modelId } from './catalog-models'

/** The engines whose models carry variants with the core's verdicts, read again from their own catalog. */
const VARIANT_ENGINES = [
  { key: 'foundry', engine: 'foundry-local', catalog: 'Foundry' },
  { key: 'litert', engine: 'litert-lm', catalog: 'LiteRT-LM' },
] as const

export function CatalogRuntimeOptions({
  workspace,
  model,
  onStarted,
}: {
  workspace: Workspace
  model: RecordValue
  onStarted?: () => void
}) {
  const variants = VARIANT_ENGINES.find((v) => model[v.key])
  const [engine, setEngine] = useState('')
  const [engineDialog, setEngineDialog] = useState(false)
  const [revision, setRevision] = useState(0)
  const [current, setCurrent] = useState(record(variants ? model[variants.key] : undefined))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const refreshVariants = async () => {
    if (!variants) return
    setRefreshing(true)
    setError('')
    try {
      const result = await workspace.execute('models.search', {
        engine: variants.engine,
        query: modelId(model),
      })
      const next = rows(result).find((candidate) => candidate.model_id === modelId(model))
      if (!next) throw new Error(`This model is no longer in the ${variants.catalog} catalog.`)
      setCurrent(next)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setRefreshing(false)
    }
  }
  const closeEngineDialog = () => {
    setEngineDialog(false)
    void refreshVariants()
  }
  return (
    <>
      {variants ? (
        <>
          {refreshing && <p role="status">Checking variants…</p>}
          {error && (
            <p role="alert">
              {error} <Action onClick={refreshVariants}>Retry</Action>
            </p>
          )}
          {variants.key === 'foundry' ? (
            <FoundryModelInstall
              embedded
              workspace={workspace}
              model={current as never}
              onClose={() => {}}
              onStarted={onStarted}
              onFoundry={() => setEngineDialog(true)}
            />
          ) : (
            <LiteRtModelInstall
              embedded
              workspace={workspace}
              model={current as never}
              onClose={() => {}}
              onStarted={onStarted}
              onEngine={() => setEngineDialog(true)}
            />
          )}
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
      {engineDialog && variants?.key === 'foundry' && (
        <FoundryLocal workspace={workspace} onClose={closeEngineDialog} />
      )}
      {engineDialog && variants?.key === 'litert' && (
        <LiteRtLm workspace={workspace} onClose={closeEngineDialog} />
      )}
    </>
  )
}
