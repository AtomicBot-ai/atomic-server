import { expect, it } from 'vitest'
import { featurePrompt } from './feature-prompt.js'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../contract/index.js'
const state = {
  assistants: [{ ...DEFAULT_ASSISTANT, instructions: 'Review carefully.' }],
  default_assistant: 'atomic-chat',
  skills: [{ name: 'test', description: '', body: 'Check behavior.', enabled: true, updated_at: 0 }],
  connectors: [],
  connector_status: {},
  attachments: DEFAULT_ATTACHMENTS,
}
it('applies an explicit assistant alongside a custom system prompt without mutating persisted messages', () => {
  const input = {
    messages: [
      { role: 'system', content: 'Use short sentences.' },
      { role: 'user', content: 'Review' },
    ],
    atomic_assistant: 'atomic-chat',
    atomic_skills: ['test'],
    atomic_system: 'Use short sentences.',
  }
  const wire = featurePrompt(state, input)
  expect(wire.messages).toEqual([
    { role: 'system', content: 'Review carefully.\n\nSkill: test\nCheck behavior.' },
    ...input.messages,
  ])
  expect(featurePrompt(state, input)).toEqual(wire)
  expect(input.messages).toHaveLength(2)
  expect(wire).not.toHaveProperty('atomic_skills')
  expect(wire).not.toHaveProperty('atomic_system')
})
it('respects a manually supplied system prompt when no assistant was explicitly selected', () => {
  expect(featurePrompt(state, { messages: [{ role: 'system', content: 'Custom' }] }).messages).toEqual([
    { role: 'system', content: 'Custom' },
  ])
})
