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
  it("writes a known served window into each agent's own setting, and nothing when it is unknown", () => {
    const at = (id: Parameters<typeof agentProfile>[0], window?: number) =>
      agentProfile(id, 'http://localhost:1/v1', 'coder', 'key', '/p', 1, window)
    expect(at('claude', 65536).env).toMatchObject({
      CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1',
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '65536',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192',
    })
    expect(at('claude').env).not.toHaveProperty('CLAUDE_CODE_MAX_CONTEXT_TOKENS')
    expect(at('codex', 40000).args).toEqual(
      expect.arrayContaining(['model_context_window=40000', 'model_auto_compact_token_limit=30000'])
    )
    expect(at('codex').args.join(' ')).not.toContain('model_context_window')
    const provider = (window?: number) =>
      (at('atomic-agent', window).config as { llm: { providers: Record<string, unknown>[] } }).llm
        .providers[0]
    expect(provider(32768)).toMatchObject({
      userModels: [{ id: 'coder', kind: 'chat', contextWindow: 32768 }],
    })
    expect(provider()).not.toHaveProperty('userModels')
    const opencode = (window?: number) =>
      JSON.parse(at('opencode', window).env['OPENCODE_CONFIG_CONTENT']!) as {
        provider: { 'atomic-chat': { options: object; models: Record<string, object> } }
      }
    expect(opencode(32768).provider['atomic-chat']).toMatchObject({
      options: { timeout: false, headerTimeout: false },
      models: {
        coder: {
          reasoning: true,
          interleaved: { field: 'reasoning_content' },
          limit: { context: 32768, output: 8192 },
        },
      },
    })
    expect(opencode().provider['atomic-chat'].models['coder']).not.toHaveProperty('limit')
  })
})
