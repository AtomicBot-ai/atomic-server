import { describe, expect, it } from 'vitest'
import { agentProfile, AGENTS } from './plan.js'
describe('agent connection profiles', () => {
  it('offers distinct client adapters and sends credentials through environment variables', () => {
    expect(AGENTS.map((a) => a.name)).toEqual(['Atomic Agent', 'Claude Code', 'Codex', 'OpenCode'])
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
  it('connects Codex through Responses without storing credentials or overriding user permissions', () => {
    const profile = agentProfile(
      'codex',
      'http://localhost:14447/v1',
      'owner/model',
      'private-key',
      '/unused'
    )
    expect(profile.env).toEqual({ ATC_AGENT_API_KEY: 'private-key' })
    expect(profile.config).toBeUndefined()
    expect(profile.args.slice(0, 4)).toEqual(['--model', 'owner/model', '-c', 'model_provider="atomic_chat"'])
    expect(profile.args.at(-1)).toContain('wire_api="responses"')
    expect(profile.args.at(-1)).toContain('supports_websockets=false')
    expect(profile.args.at(-1)).toContain('requires_openai_auth=false')
    expect(profile.args.at(-1)).toContain('base_url="http://localhost:14447/v1"')
    expect(profile.args.join(' ')).not.toMatch(/private-key|approval|sandbox|CODEX_HOME/)
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
