import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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
    const report = failureReport(new Error('The engine returned an empty response.', { cause: error }), {
      component: 'tui',
      operation: 'workspace.read',
    })
    if (!report) throw new Error('Expected a boundary error report')
    reporter.capture(report)
    await reporter.flush(1000)
    expect(fetch).toHaveBeenCalledTimes(1)
    const envelope = String(fetch.mock.calls[0]?.[1]?.body)
    expect(envelope).toContain('"diagnostic_cause_code":"ConnectionRefused"')
    expect(envelope).toContain('"diagnostic_code":"CHAT_STREAM_EMPTY_RESPONSE"')
    expect(envelope).not.toContain('fixture-private-token')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const context = { component: 'chat', operation: 'chat.stream' }

describe('bounded chat.stream diagnostic tags', () => {
  it('classifies exact chat stream Error messages and approved cause codes', () => {
    expect(nativeFailureTags(new Error('The engine returned an empty response.'))).toEqual({
      diagnostic_code: 'CHAT_STREAM_EMPTY_RESPONSE',
    })
    expect(nativeFailureTags(new Error('An engine stream frame exceeded 8 MB.'))).toEqual({
      diagnostic_code: 'CHAT_STREAM_FRAME_TOO_LARGE',
    })
    expect(
      nativeFailureTags(new Error('The stream ended unexpectedly. The partial answer is saved.'))
    ).toEqual({
      diagnostic_code: 'CHAT_STREAM_ENDED_UNEXPECTEDLY',
    })
    expect(nativeFailureTags(new Error('Invalid tool-call index.'))).toEqual({
      diagnostic_code: 'CHAT_STREAM_INVALID_TOOL_CALL_INDEX',
    })

    const fsCause = Object.assign(new Error('read failed'), { code: 'ENOENT' })
    const wrapped = new Error('Cannot read keys.json. The existing file has been preserved.', {
      cause: fsCause,
    })
    expect(nativeFailureTags(wrapped)).toEqual({
      diagnostic_cause_code: 'ENOENT',
    })

    const report = failureReport(
      new Error('The stream ended unexpectedly. The partial answer is saved.', {
        cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }),
      }),
      context
    )
    expect(report).toMatchObject({
      source: 'event_listener',
      level: 'error',
      error: { name: 'Error', message: 'Unexpected failure in chat.stream' },
      tags: {
        component: 'chat',
        operation: 'chat.stream',
        diagnostic_code: 'CHAT_STREAM_ENDED_UNEXPECTEDLY',
        diagnostic_cause_code: 'ECONNRESET',
      },
    })
  })

  it('preserves segmenter native diagnostics alongside bounded observer tags', () => {
    expect(nativeFailureTags(new TypeError('failed to initialize Segments'))).toEqual({
      native_failure: 'JSC_INTL_SEGMENTS_INIT_FAILED',
    })
  })

  it('ignores arbitrary messages, unapproved cause codes, deep chains and cyclic causes', () => {
    expect(
      nativeFailureTags(
        new Error('The stream ended unexpectedly. The partial answer is saved. secret-fixture-text')
      )
    ).toEqual({})

    const unapproved = Object.assign(new Error('private details'), { code: 'CUSTOM_PRIVATE_CODE' })
    expect(nativeFailureTags(new Error('wrapper', { cause: unapproved }))).toEqual({})

    const cycleA = new Error('cycle a')
    const cycleB = new Error('cycle b', { cause: cycleA })
    Object.defineProperty(cycleA, 'cause', { value: cycleB })
    expect(nativeFailureTags(cycleA)).toEqual({})

    let chain: Error = Object.assign(new Error('too deep'), { code: 'ECONNRESET' })
    for (let i = 0; i < 5; i++) {
      chain = new Error(`wrap-${i}`, { cause: chain })
    }
    expect(nativeFailureTags(chain)).toEqual({})
  })
})
