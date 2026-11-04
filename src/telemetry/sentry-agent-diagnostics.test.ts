import { describe, expect, it } from 'vitest'
import { failureReport } from './failures.js'
import { nativeFailureTags } from './native-diagnostics.js'

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
