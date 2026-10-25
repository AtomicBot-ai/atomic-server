import { describe, expect, it } from 'vitest'
import { DEFAULT_ATTACHMENTS } from '../../contract/index.js'
import type { WorkspaceFeatures } from '../../contract/index.js'
import { featurePrompt } from './feature-prompt.js'
import { skillValue } from './feature-validation.js'

const state = {
  assistants: [{ id: 'dated', name: 'Dated', instructions: 'Today is {{current_date}}.', parameters: {} }],
  default_assistant: 'dated',
  skills: [],
  connectors: [],
  attachments: DEFAULT_ATTACHMENTS,
} as unknown as WorkspaceFeatures

describe('the clock in workspace features', () => {
  it('fills the assistant’s {{current_date}} from the given time', () => {
    const body = featurePrompt(state, { messages: [] }, new Date('2026-03-04T23:30:00Z'))
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Today is 2026-03-04.' })
  })

  it('stamps a saved skill with the given time', () => {
    expect(skillValue({ name: 'review', body: 'Check it' }, 1234).updated_at).toBe(1234)
  })
})
