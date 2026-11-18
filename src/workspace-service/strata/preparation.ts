import { setTimeout } from 'node:timers/promises'
import type { StrataPreparationOperation, StrataPreparationRequest } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../../core-link/index.js'

const route = '/strata/preparations'
export const strataServerStopped = new Error('Strata setup interrupted by server shutdown.')
export class StrataPreparationFailed extends Error {}
const idle = new Set(['failed', 'interrupted', 'cancelled'])

export async function prepareStrata(
  link: CoreLink,
  input: StrataPreparationRequest,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) {
    if (signal.reason === strataServerStopped) throw signal.reason
    throw new StrataPreparationFailed('Strata preparation cancelled before it started.')
  }
  let operation = await link.request<StrataPreparationOperation>('POST', route, input)
  const path = route + '/' + encodeURIComponent(operation.operation_id)
  try {
    if (operation.state === 'ready') return
    signal.throwIfAborted()
    if (idle.has(operation.state))
      operation = await link.request<StrataPreparationOperation>('POST', path + '/resume', {})
    for (;;) {
      if (operation.state === 'ready') return
      signal.throwIfAborted()
      if (idle.has(operation.state))
        throw new StrataPreparationFailed(
          operation.error?.message ?? `Strata preparation is ${operation.state}.`
        )
      await setTimeout(300, undefined, { signal })
      operation = await link.request<StrataPreparationOperation>('GET', path)
    }
  } catch (error) {
    if (signal.reason === strataServerStopped) throw signal.reason
    if (signal.aborted && operation.state !== 'ready') {
      const stopped = await link.request<StrataPreparationOperation>('POST', path + '/cancel', {})
      if (idle.has(stopped.state)) throw new StrataPreparationFailed('Strata preparation cancelled.')
      if (stopped.state === 'ready') return
    }
    throw error
  }
}
