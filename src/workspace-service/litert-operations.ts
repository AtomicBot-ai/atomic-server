/** The `litert.*` operations of the workspace: the accelerator; `NOT_CORE` for any other. */

import type { WorkspaceInput } from '../contract/index.js'
import type { LiteRtAccelerators } from './litert.js'
import { NOT_CORE } from './not-core.js'

export function litertOperation(
  accelerators: LiteRtAccelerators,
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
  }
  return NOT_CORE
}
