import { expect, it } from 'vitest'
import { chatRequest } from './chat-request'
const service = { model: 'actual' } as never
const selection = { assistant: 'reviewer', skills: ['writing'], connectors: ['local'] }
it('preserves feature selections for history and combines explicit connector tools', () => {
  const definition = { type: 'function', function: { name: 'mcp_tool' } }
  expect(
    chatRequest('{"model":"wrong","temperature":0.2,"tools":[{"type":"function"}]}', service, selection, [
      { definition } as never,
    ])
  ).toEqual({
    model: 'actual',
    temperature: 0.2,
    atomic_assistant: 'reviewer',
    atomic_skills: ['writing'],
    atomic_connectors: ['local'],
    tools: [{ type: 'function' }, definition],
  })
})
it.each(['no', '[]', 'null'])('rejects malformed request parameters before sending: %s', (parameters) => {
  expect(() => chatRequest(parameters, service, selection, [])).toThrow(/Request JSON/)
})
it('requires a ready service', () => {
  expect(() => chatRequest('{}', undefined, selection, [])).toThrow(/ready model/)
})

it('replaces saved connector definitions and removes deselected tools on a reopened conversation', () => {
  const saved = JSON.stringify({
    tools: [
      { type: 'function', function: { name: 'mcp_a12_read' } },
      { type: 'function', function: { name: 'manual_tool' } },
    ],
  })
  expect(chatRequest(saved, service, { ...selection, connectors: [] }, []).tools).toEqual([
    { type: 'function', function: { name: 'manual_tool' } },
  ])
  const definition = { type: 'function', function: { name: 'mcp_a12_read' } }
  expect(chatRequest(saved, service, selection, [{ definition } as never]).tools).toEqual([
    { type: 'function', function: { name: 'manual_tool' } },
    definition,
  ])
})
