import { expect, it } from 'vitest'
import { AtcError } from '../errors/index.js'
import { failureReport } from './failures.js'
import { nativeFailureTags } from './native-diagnostics.js'

it('captures allowlisted cause codes through nativeFailureTags without leaking private messages or breaking on cycles', () => {
  const socketCause = Object.assign(new Error('connect ECONNREFUSED private-fixture-endpoint'), {
    code: 'ECONNREFUSED',
  })
  const fetchFailure = new Error('fetch failed for private-fixture-token', { cause: socketCause })

  expect(nativeFailureTags(fetchFailure)).toEqual({
    diagnostic_cause_code: 'ECONNREFUSED',
  })

  const report = failureReport(fetchFailure, {
    component: 'tui',
    operation: 'workspace.read',
  })
  expect(report).toMatchObject({
    source: 'event_listener',
    level: 'error',
    tags: {
      component: 'tui',
      operation: 'workspace.read',
      diagnostic_cause_code: 'ECONNREFUSED',
    },
    error: {
      name: 'Error',
      message: 'Unexpected failure in workspace.read',
    },
  })
  expect(JSON.stringify(report)).not.toContain('private-fixture')

  // Cyclic cause chains terminate cleanly while preserving allowlisted cause codes.
  const cycleRoot = new Error('cycle root private-fixture')
  const cycleLeaf = Object.assign(new Error('cycle leaf private-fixture'), {
    code: 'ECONNRESET',
  })
  cycleRoot.cause = cycleLeaf
  cycleLeaf.cause = cycleRoot
  expect(nativeFailureTags(cycleRoot)).toEqual({
    diagnostic_cause_code: 'ECONNRESET',
  })

  // Cause traversal stops after five Error levels (depths 0..4).
  const deepAllowed = Object.assign(new Error('depth-4'), { code: 'UND_ERR_SOCKET' })
  const withinLimit = new Error('d0', {
    cause: new Error('d1', {
      cause: new Error('d2', {
        cause: new Error('d3', {
          cause: deepAllowed,
        }),
      }),
    }),
  })
  expect(nativeFailureTags(withinLimit)).toEqual({
    diagnostic_cause_code: 'UND_ERR_SOCKET',
  })
  const beyondLimit = new Error('d-top', { cause: withinLimit })
  expect(nativeFailureTags(beyondLimit)).toEqual({})

  // Non-allowlisted codes, arbitrary text, and hostile getters do not leak or throw.
  const unallowlisted = new Error('outer private-fixture', {
    cause: Object.assign(new Error('inner private-fixture'), { code: 'PRIVATE_CUSTOM_CODE' }),
  })
  expect(nativeFailureTags(unallowlisted)).toEqual({})

  const hostile = new Error('hostile')
  Object.defineProperty(hostile, 'cause', {
    get() {
      throw new Error('getter boom')
    },
  })
  expect(nativeFailureTags(hostile)).toEqual({})

  // Existing native segmenter diagnostics and expected-failure exclusions remain intact.
  expect(nativeFailureTags(new TypeError('failed to initialize Segments'))).toEqual({
    native_failure: 'JSC_INTL_SEGMENTS_INIT_FAILED',
  })
  expect(
    failureReport(new AtcError('ATC_USAGE', 'expected usage refusal'), {
      component: 'tui',
      operation: 'workspace.read',
    })
  ).toBeNull()
})
