import type { WorkspaceServiceRow } from '@contract'
import { Action } from '../Controls'
import type { Execute } from '../types'
import { useConfirmation } from '../use-confirmation'

export function EngineReload({
  provider,
  models,
  execute,
  disabled,
  onNotice,
}: {
  provider: string
  models: WorkspaceServiceRow[]
  execute: Execute
  disabled: boolean
  onNotice: (notice: string) => void
}) {
  const { ask, confirmation, waiting } = useConfirmation()
  return (
    <>
      {models.length > 0 && (
        <details>
          <summary>Reload a model to apply saved settings</summary>
          <p>Reload interrupts active requests. Save or discard pending edits first.</p>
          {models.map((model) => (
            <Action
              key={model.id}
              disabled={disabled || waiting}
              onClick={() => {
                let unloaded = false
                ask({
                  title: `Reload ${model.model}?`,
                  actionLabel: 'Reload model',
                  children: <p>Active requests will be interrupted.</p>,
                  onConfirm: async () => {
                    onNotice('')
                    if (!unloaded) {
                      await execute('models.unload', { provider, model_id: model.model })
                      unloaded = true
                    }
                    await execute('models.load', { provider, model_id: model.model })
                    onNotice(`Reloaded ${model.model} with saved settings.`)
                  },
                })
              }}
            >
              Reload {model.model}
            </Action>
          ))}
        </details>
      )}
      {confirmation}
    </>
  )
}
