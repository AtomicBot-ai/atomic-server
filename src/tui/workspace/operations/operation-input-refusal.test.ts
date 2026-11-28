import { describe, expect, it } from 'vitest'
import { AtcError } from '../../../errors/index.js'
import { failureReport } from '../../../telemetry/index.js'
import { inputObject, parseField } from './operation-model.js'

describe('operation form input refusals', () => {
  it('minimum field value is a usage refusal', () => {
    const refusals = [
      () => parseField({ type: 'number', minimum: 0 }, '-1'),
      () => parseField({ type: 'number', maximum: 10 }, '11'),
      () => parseField({ type: 'integer' }, '1.5'),
      () => parseField({ type: 'array' }, '{}'),
      () => parseField({ type: 'object' }, 'not json'),
      () => inputObject('[]'),
      () => inputObject('not json'),
    ]
    for (const refusal of refusals) {
      let thrown: unknown
      try {
        refusal()
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(AtcError)
      expect((thrown as AtcError).code).toBe('ATC_USAGE')
      expect(failureReport(thrown, { component: 'tui', operation: 'workspace.action' })).toBeNull()
    }
  })
})
