/** The `foundry.*` operations of the workspace: accelerators and variant downloads; `NOT_CORE` for any other. */

import type { WorkspaceInput } from '../../contract/index.js'
import type { FoundryAccelerators } from './foundry.js'
import type { FoundryModelSetups } from './foundry-model-setups.js'
import { NOT_CORE } from '../not-core.js'

export function foundryOperation(
  accelerators: FoundryAccelerators,
  models: FoundryModelSetups,
  operation: string,
  input: WorkspaceInput
): Promise<unknown> | typeof NOT_CORE {
  switch (operation) {
    case 'foundry.accelerators':
      return accelerators.status(input['force'] === true)
    case 'foundry.prepare':
      return accelerators.prepare(
        Array.isArray(input['accelerators']) ? input['accelerators'].map(String) : undefined
      )
    case 'foundry.plan':
      return models.plan({
        model: String(input['model']),
        ...(typeof input['variant'] === 'string' ? { variant: input['variant'] } : {}),
        ...(typeof input['device'] === 'string' ? { device: input['device'] } : {}),
      })
    case 'foundry.install':
      return models.install(input)
    case 'foundry.cancel':
      return models.cancel(String(input['id']))
  }
  return NOT_CORE
}
