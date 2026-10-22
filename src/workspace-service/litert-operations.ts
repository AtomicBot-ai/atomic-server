/** The `litert.*` operations of the workspace: the accelerator and variant downloads; `NOT_CORE` for any other. */

import type { WorkspaceInput } from '../contract/index.js'
import type { LiteRtAccelerators } from './litert.js'
import type { LiteRtModelSetups } from './litert-model-setups.js'
import { NOT_CORE } from './not-core.js'

/** What the server keeps of LiteRT-LM: the accelerator's prepare and the variant downloads. */
export interface LiteRtParts {
  accelerators: LiteRtAccelerators
  models: LiteRtModelSetups
}

export function litertOperation(
  { accelerators, models }: LiteRtParts,
  operation: string,
  input: WorkspaceInput
): Promise<unknown> | typeof NOT_CORE {
  switch (operation) {
    case 'litert.accelerators':
      return accelerators.status()
    case 'litert.prepare':
      return accelerators.prepare(
        Array.isArray(input['accelerators']) ? input['accelerators'].map(String) : undefined
      )
    case 'litert.plan':
      return models.plan({
        model: String(input['model']),
        ...(typeof input['variant'] === 'string' ? { variant: input['variant'] } : {}),
        ...(typeof input['backend'] === 'string' ? { backend: input['backend'] } : {}),
      })
    case 'litert.install':
      return models.install(input)
    case 'litert.cancel':
      return models.cancel(String(input['id']))
  }
  return NOT_CORE
}
