import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { AtcError, describeError, errorBody, exitCodeFor } from './errors.js'

describe('errors', () => {
  it('maps usage and stubs to their exit codes, everything else to 1', () => {
    expect(exitCodeFor(new AtcError('ATC_USAGE', 'x'))).toBe(2)
    expect(exitCodeFor(new AtcError('ATC_NOT_IMPLEMENTED', 'x'))).toBe(3)
    expect(exitCodeFor(new AtcError('ATC_CONFIG_INVALID', 'x'))).toBe(1)
    expect(exitCodeFor(new AtomicCoreError('CORE_NOT_RUNNING', 'x'))).toBe(1)
    expect(exitCodeFor(new Error('x'))).toBe(1)
  })

  it('keeps the core error codes and renders details and hints', () => {
    expect(errorBody(new AtomicCoreError('MODEL_NOT_FOUND', 'gone', 'id'))).toEqual({
      code: 'MODEL_NOT_FOUND',
      message: 'gone',
      details: 'id',
    })
    const text = describeError(
      new AtcError('ATC_CONSENT_REQUIRED', 'Needs a yes.', { hint: 're-run with --yes' })
    )
    expect(text).toBe('Needs a yes.\n  [ATC_CONSENT_REQUIRED]\n  hint: re-run with --yes')
    expect(errorBody('boom')).toEqual({ code: 'ATC_INTERNAL', message: 'boom' })
  })
})

// The core's own command is `atomic-chat-cli`; a person at `atc` must be told atc's commands.
it("rewrites the core's CLI commands in its messages to atc's", () => {
  const notInstalled = new AtomicCoreError(
    'MODEL_NOT_FOUND',
    "Model 'm' is not installed. Run `atomic-chat-cli models list` to see available models.",
    '/data/llamacpp/models/m/model.yml'
  )
  expect(errorBody(notInstalled).message).toBe(
    "Model 'm' is not installed. Run `atc models list` to see available models."
  )
  expect(errorBody(new AtomicCoreError('IO_ERROR', 'Try atomic-chat-cli serve owner/repo')).message).toBe(
    'Try atc run owner/repo'
  )
  expect(errorBody(new AtomicCoreError('IO_ERROR', 'ok', 'see atomic-chat-cli engines list')).details).toBe(
    'see atc engines list'
  )
  // The default data folder is named after the core's CLI: a path is not a command.
  const path = '/Users/u/Library/Application Support/atomic-chat-cli/data/llamacpp/models/m/model.yml'
  expect(errorBody(new AtomicCoreError('MODEL_NOT_FOUND', 'gone', path)).details).toBe(path)
})
