/**
 * `atc engines rm <managed>` (spec managed-engines-server, "Удаление managed-движка"): the removal
 * described and agreed to as an install is — on a terminal, --yes, or --approve of the removal plan's
 * digest the core offers once it begins — then followed.
 */

import { randomUUID } from 'node:crypto'
import type { EnvironmentOperation } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../../cli/index.js'
import { AtcError } from '../../cli/index.js'
import { agreeRemoval, continueOperation, nothingChanged, printRemoval, run } from './managed-engine.js'
import { engineState, managedSession } from './managed-session.js'

/** `atc engines rm <managed> [--keep-models]`: the removal described, agreed to, then followed. */
export async function removeManagedEngine(
  ctx: CommandContext,
  engine: string,
  values: Record<string, unknown>
): Promise<number> {
  const s = await managedSession(ctx, values)
  try {
    const state = await engineState(s, engine)
    if (state.operation) {
      if (state.operation.kind === 'remove') return await continueOperation(s, state.operation)
      throw new AtcError('ATC_USAGE', `The ${state.operation.kind} of ${engine} is still running.`, {
        hint: `cancel it with atc engines install --cancel ${state.operation.operation_id}`,
      })
    }
    if (!state.installation) throw new AtcError('ATC_USAGE', `${engine} is not installed.`)
    const keep = values['keep-models'] === true
    printRemoval(s, state, keep)
    if (!(await agreeRemoval(s, engine))) return nothingChanged(s)
    const op = (await s.service.execute('engines.operate', {
      engine,
      kind: 'remove',
      request_id: typeof values['request-id'] === 'string' ? values['request-id'] : randomUUID(),
      retain_models: keep,
    })) as EnvironmentOperation
    return await run(s, op, { kind: 'remove' })
  } finally {
    s.close()
  }
}
