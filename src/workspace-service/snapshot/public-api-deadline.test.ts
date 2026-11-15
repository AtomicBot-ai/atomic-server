import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { AtcError } from '../../errors/index.js'
import { failureReport } from '../../telemetry/index.js'
import { ClientKeys } from '../../terminal-data/index.js'
import { verifyWorkload } from './readiness.js'

/** The rejection `AbortSignal.timeout` produces when the verification deadline expires during fetch. */
function expiredDeadline() {
  return new Promise<never>((_resolve, reject) => {
    const signal = AbortSignal.timeout(1)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

it('answers an expired verification deadline as a typed refusal', async () => {
  const link = fakeCoreLink({
    server: {
      running: true,
      host: '127.0.0.1',
      port: 1337,
      prefix: '/v1',
      requires_api_key: false,
      pid: 1,
    },
  })
  let reached = false
  const request = (async () => {
    reached = true
    return expiredDeadline()
  }) as unknown as typeof fetch
  const error = await verifyWorkload(link, defaultConfig(), new ClientKeys('/unused'), request, [
    { id: 'chat', provider: 'mlx', model: 'local/model', kind: 'chat', state: 'ready', details: {} },
  ]).then(
    () => undefined,
    (failure: unknown) => failure
  )
  expect(reached).toBe(true)
  expect(error).toBeInstanceOf(AtcError)
  expect((error as AtcError).code).toBe('ATC_USAGE')
  expect(failureReport(error, { component: 'workspace', operation: 'setup.complete' })).toBeNull()
})
