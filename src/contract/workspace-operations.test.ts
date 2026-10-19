import { describe, expect, it } from 'vitest'
import { WORKSPACE_OPERATIONS } from './workspace-operations.js'
import { operation, request } from './operations/define.js'

describe('the workspace operation registry', () => {
  it('names every operation once', () => {
    const names = WORKSPACE_OPERATIONS.map((op) => op.name)
    expect(new Set(names).size).toBe(names.length)
  })

  // The description is the MCP tool description: an agent picks a tool by it alone.
  it.each(WORKSPACE_OPERATIONS.map((op) => [op.name, op] as const))(
    '%s says what it does, beyond its title',
    (_name, op) => {
      expect(op.description).not.toBe(op.title)
      expect(op.description.length).toBeGreaterThanOrEqual(20)
      expect(op.description).toMatch(/\.$/)
    }
  )

  it('lets only reads and revealed secrets leave state alone', () => {
    for (const op of WORKSPACE_OPERATIONS.filter((op) => !op.mutates))
      expect(['read', 'secret']).toContain(op.effect)
  })
})

describe('operation', () => {
  it('derives the group and mutation from the name and effect, with no input by default', () => {
    expect(operation('keys.revoke', 'Revoke', 'configure', 'Revoke a key.')).toEqual({
      name: 'keys.revoke',
      title: 'Revoke',
      group: 'keys',
      description: 'Revoke a key.',
      mutates: true,
      effect: 'configure',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    })
    expect(operation('keys.list', 'Keys', 'read', 'List keys.').mutates).toBe(false)
  })

  it('takes fields, required names and a mutation override', () => {
    const op = operation(
      'keys.reveal',
      'Reveal',
      'secret',
      'Reveal a key.',
      { properties: { id: { type: 'string' } }, required: ['id'] },
      { mutates: false }
    )
    expect(op.mutates).toBe(false)
    expect(op.inputSchema).toMatchObject({ properties: { id: { type: 'string' } }, required: ['id'] })
  })
})

describe('request', () => {
  it('documents the listed fields and forwards any others', () => {
    expect(request({ prompt: {} }, ['prompt'])).toEqual({
      type: 'object',
      properties: { prompt: {} },
      required: ['prompt'],
      additionalProperties: true,
    })
  })
})
