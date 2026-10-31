import { describe, expect, it, vi } from 'vitest'
import { AtomicCoreError } from '@atomic-chat/core'
import { AtcError, remoteError } from '../errors/index.js'
import { captureFailure, expectedFailure, failureReport } from './failures.js'

const context = { component: 'cli', operation: 'update' }
describe('failure ownership and privacy', () => {
  it.each([
    [new AtcError('ATC_USAGE', 'bad input'), true],
    [new AtcError('ATC_SERVICE_NOT_INSTALLED', 'absent service'), true],
    [new AtcError('ATC_SERVICE_FAILED', 'service manager failed'), false],
    [new AtcError('ATC_UPDATE_UNSUPPORTED', 'package manager owns the binary'), true],
    [new AtcError('ATC_UPDATE_FAILED', 'release download failed'), false],
    [new AtcError('ATC_CHECKSUM_MISMATCH', 'corrupt release'), false],
    [new AtcError('ATC_CONFIG_MIGRATION_FAILED', 'missing migration'), false],
    [new AtomicCoreError('CORE_NOT_RUNNING', 'gone'), true],
    [remoteError(new AtcError('ATC_INTERNAL', 'remote bug')), true],
    [Object.assign(new Error('stop'), { name: 'AbortError' }), true],
    [new TypeError('bug'), false],
  ])('classifies %s', (error, expected) => expect(expectedFailure(error)).toBe(expected))

  it('keeps the code and frames, without free-form input or details', () => {
    const error = new AtcError('ATC_INTERNAL', 'prompt secret-here', { details: 'reply secret-here' })
    const report = failureReport(error, context)!
    expect(report.tags).toMatchObject({ error_code: 'ATC_INTERNAL' })
    expect(report.error).toBeInstanceOf(Error)
    expect((report.error as Error).stack).toContain('failures.test.ts')
    expect((report.error as Error).stack).not.toContain('secret-here')
    expect(report.error).not.toHaveProperty('details')
  })

  it('reports the same exception once across nested handlers', () => {
    const capture = vi.fn(),
      error = new Error('bug')
    captureFailure({ capture }, error, context)
    captureFailure({ capture }, error, { component: 'admin', operation: 'workspace.execute' })
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
