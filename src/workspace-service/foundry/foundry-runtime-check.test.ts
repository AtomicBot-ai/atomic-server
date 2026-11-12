import { AtomicCoreError } from '@atomic-chat/core'
import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { checkFoundryRuntime, foundryRuntimeMinimum } from './foundry-runtime-check.js'

const variant = { execution_provider: 'cpu', device: 'cpu' }
const checkPath = '/models/foundry-local/check'
const ok = { verdict: 'ok', reason: null, accelerator: null }

function legacyCore(active: string | undefined) {
  const link = fakeCoreLink()
  link.responses[`POST ${checkPath}`] = (body: unknown) => {
    if ('min_runtime_version' in (body as Record<string, unknown>))
      throw new AtomicCoreError(
        'INVALID_ARGUMENT',
        'The request has fields this core does not know: min_runtime_version.'
      )
    return ok
  }
  link.responses['POST /engines/versions'] = {
    engines: [
      { engine: 'foundry-local', active: active && { version: active }, latest: { version: 'v2.10.0' } },
    ],
  }
  return link
}

it.each([undefined, '', '2.4', '2.4.0\n', '0.0.0', '00.0.0', 2.4])(
  'treats an unset or invalid Azure minimum (%j) as unconstrained',
  (value) => {
    expect(foundryRuntimeMinimum(value)).toBeUndefined()
    expect(foundryRuntimeMinimum(value, '2.4.0')).toBe('2.4.0')
  }
)

it('keeps the highest minimum reported for the same revision', () => {
  expect(foundryRuntimeMinimum('2.4.0', '2.10.0')).toBe('2.10.0')
  expect(foundryRuntimeMinimum('2.10.0', '2.4.0')).toBe('2.10.0')
})

it.each(['v2.4.0', 'v2.10.0'])(
  'checks the active build numerically on a legacy core (%s)',
  async (active) => {
    const link = legacyCore(active)
    await expect(checkFoundryRuntime(link, variant, '2.4.0')).resolves.toEqual({ verdict: ok })
    expect(link.calls.map(({ path, body }) => ({ path, body }))).toEqual([
      { path: checkPath, body: { ...variant, min_runtime_version: '2.4.0' } },
      { path: checkPath, body: variant },
      { path: '/engines/versions', body: {} },
    ])
  }
)

it('reports a sufficient update when a legacy core has an older active build', async () => {
  await expect(checkFoundryRuntime(legacyCore('v2.1.0'), variant, '2.4.0')).resolves.toMatchObject({
    verdict: { verdict: 'engine-update-required', reason: expect.stringContaining('2.1.0') },
    updateAvailable: true,
  })
})

it('keeps the runtime refusal when the engine source is unavailable', async () => {
  const link = legacyCore('v2.1.0')
  link.responses['POST /engines/versions'] = {
    engines: [{ engine: 'foundry-local', active: { version: 'v2.1.0' }, source_error: 'Offline' }],
  }
  await expect(checkFoundryRuntime(link, variant, '2.4.0')).resolves.toMatchObject({
    verdict: { verdict: 'engine-update-required', reason: expect.stringContaining('2.1.0') },
    updateAvailable: false,
    blocker: expect.stringContaining(
      'Could not determine whether a compatible Foundry Local update is available.'
    ),
  })
})

it('stops if the legacy core cannot identify the active build', async () => {
  await expect(checkFoundryRuntime(legacyCore(undefined), variant, '2.4.0')).rejects.toThrow(
    'A newer Atomic Chat core is needed'
  )
})

it('propagates unrelated validation errors without retrying the old request', async () => {
  const link = legacyCore('v2.4.0')
  const failure = new AtomicCoreError('INVALID_ARGUMENT', 'device is required.')
  link.responses[`POST ${checkPath}`] = failure
  await expect(checkFoundryRuntime(link, variant, '2.4.0')).rejects.toBe(failure)
  expect(link.calls).toHaveLength(1)
})
