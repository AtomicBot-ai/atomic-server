import { describe, expect, it } from 'vitest'
import { agentProfile, AGENTS } from './plan.js'
describe('agent connection profiles', () => {
  it('offers distinct client adapters and sends credentials through environment variables', () => {
    expect(AGENTS.map((a) => a.name)).toEqual(['Atomic Agent', 'Claude Code', 'OpenCode'])
    const atomic = agentProfile(
      'atomic-agent',
      'http://127.0.0.1:4321/v1',
      'coder',
      'private-key',
      '/profiles/atomic'
    )
    expect(atomic.env['ATOMIC_AGENT_STATE_DIR']).toBe('/profiles/atomic')
    expect(JSON.stringify(atomic.config)).not.toContain('private-key')
    expect(atomic.config).toMatchObject({
      llm: { activeTextProvider: 'atomic-chat', activeEmbeddingProvider: 'local-llama' },
    })
    const claude = agentProfile('claude', 'http://127.0.0.1:4321/v1', 'coder', 'key', '/profiles/claude')
    expect(claude.env['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:4321')
    expect(claude.env['ANTHROPIC_DEFAULT_HAIKU_MODEL']).toBe('coder')
    expect(() => agentProfile('claude', 'http://localhost:1/api', 'm', '', '/tmp')).toThrow('/v1')
  })
  it('uses the correct configuration schema for OpenCode v1 and v2', () => {
    const one = agentProfile('opencode', 'http://localhost:1/v1', 'model/with-slash', 'key', '/profiles', 1)
    expect(JSON.parse(one.env['OPENCODE_CONFIG_CONTENT']!)).toMatchObject({
      provider: { 'atomic-chat': { npm: '@ai-sdk/openai-compatible' } },
    })
    const two = agentProfile('opencode', 'http://localhost:1/v1', 'm', 'key', '/profiles', 2)
    expect(two.config).toMatchObject({
      providers: { 'atomic-chat': { package: '@opencode/ai/providers/openai-compatible' } },
    })
    expect(JSON.stringify(two.config)).not.toContain('"key"')
  })
})
