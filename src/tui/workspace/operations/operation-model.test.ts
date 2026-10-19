import { describe, expect, it } from 'vitest'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import {
  defaultInput,
  fieldValue,
  inputObject,
  operationFields,
  parseField,
  setField,
} from './operation-model.js'
import { createWorkspace } from '../state.js'
describe('server operation form', () => {
  it('maps nested media controls back into the exact request body', () => {
    const op = WORKSPACE_OPERATIONS.find((v) => v.name === 'media.image.create')!
    const fields = operationFields(op)
    expect(fields.find((v) => v.path === 'request.prompt')?.required).toBe(true)
    expect(fields.find((v) => v.path === 'request.workflow')?.schema.enum).toContain('inpaint')
    let body = defaultInput(op, createWorkspace())
    body = setField(body, 'request.prompt', 'A mountain')
    body = setField(body, 'request.width', parseField({ type: 'integer', minimum: 16 }, '512'))
    expect(inputObject(body)).toMatchObject({ request: { prompt: 'A mountain', width: 512 } })
    expect(fieldValue(body, 'request.width')).toBe(512)
    expect(fieldValue(setField(body, 'request.width', undefined), 'request.width')).toBeUndefined()
  })
  it('rejects malformed types and keeps false, zero and arrays distinct', () => {
    expect(() => parseField({ type: 'integer' }, '1.5')).toThrow('integer')
    expect(() => parseField({ type: 'number', minimum: 0 }, '-1')).toThrow('Minimum')
    expect(() => parseField({ type: 'number', maximum: 10 }, '11')).toThrow('Maximum')
    expect(() => parseField({ type: 'array' }, '{}')).toThrow('array')
    expect(() => inputObject('[]')).toThrow('object')
    const body = setField(setField('{}', 'seed', 0), 'enabled', false)
    expect(inputObject(body)).toEqual({ seed: 0, enabled: false })
    expect(parseField({ type: 'array' }, '["one"]')).toEqual(['one'])
  })
})
