import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { AtcError } from '../errors/index.js'
import { failureReport } from './failures.js'
import { nativeFailureTags } from './native-diagnostics.js'
import { createAtcReporter } from './reporter.js'

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

it('sends the finite Bun refusal code in the final Sentry envelope without private messages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-diagnostic-'))
  try {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}'))
    const reporter = await createAtcReporter({
      env: { ATC_SENTRY_DSN: 'https://fixture@ingest.example.invalid/42' },
      consent: true,
      dataFolder: dir,
      telemetryFile: join(dir, 'telemetry.json'),
      homeDir: tmpdir(),
      platform: 'linux',
      arch: 'x64',
      fetch,
      warn: () => {},
    })
    const error = Object.assign(new Error('fixture-private-token'), { code: 'ConnectionRefused' })
    const report = failureReport(error, { component: 'tui', operation: 'workspace.read' })
    if (!report) throw new Error('Expected a boundary error report')
    reporter.capture(report)
    await reporter.flush(1000)
    expect(fetch).toHaveBeenCalledTimes(1)
    const envelope = String(fetch.mock.calls[0]?.[1]?.body)
    expect(envelope).toContain('"diagnostic_cause_code":"ConnectionRefused"')
    expect(envelope).not.toContain('fixture-private-token')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
