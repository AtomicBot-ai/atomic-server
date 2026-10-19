import { endpointUrl } from '../terminal-service/index.js'
export const AGENTS = [
  {
    id: 'atomic-agent',
    name: 'Atomic Agent',
    bins: ['atomic-agent', 'atag'],
    docs: 'https://github.com/AtomicBot-ai/atomic-agent',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    bins: ['claude'],
    docs: 'https://code.claude.com/docs/en/llm-gateway-connect',
  },
  {
    id: 'codex',
    name: 'Codex',
    bins: ['codex'],
    docs: 'https://learn.chatgpt.com/docs/cli',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bins: ['opencode'],
    docs: 'https://opencode.ai/docs/providers/#atomic-chat',
  },
] as const
export type AgentId = (typeof AGENTS)[number]['id']
export interface AgentLaunch {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  cleanup?: () => Promise<void>
}
export interface Profile {
  args: string[]
  env: NodeJS.ProcessEnv
  config?: Record<string, unknown>
}
/** Only connection settings change. Permission prompts remain the agent's own defaults. */
export function agentProfile(
  id: AgentId,
  endpoint: string,
  model: string,
  key: string,
  profileDir: string,
  major = 1
): Profile {
  const base = endpointUrl(endpoint),
    credential = key || 'atomic-local'
  if (!model.trim()) throw new Error('Choose a model before opening an agent.')
  if (id === 'codex') {
    const fields = {
      name: 'Atomic Chat',
      base_url: base,
      env_key: 'ATC_AGENT_API_KEY',
      wire_api: 'responses',
      requires_openai_auth: false,
      supports_websockets: false,
    }
    // One-run TOML overrides retain the user's home, settings, sandbox and approval policy.
    // Replace this provider table as a whole so an existing auth helper cannot take precedence.
    const provider = Object.entries(fields)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join(',')
    return {
      args: [
        '--model',
        model,
        '-c',
        'model_provider="atomic_chat"',
        '-c',
        `model_providers.atomic_chat={${provider}}`,
      ],
      env: { ATC_AGENT_API_KEY: credential },
    }
  }
  if (id === 'atomic-agent')
    return {
      args: [],
      env: { ATOMIC_AGENT_STATE_DIR: profileDir, ATC_AGENT_API_KEY: credential },
      config: {
        llm: {
          activeTextProvider: 'atomic-chat',
          activeEmbeddingProvider: 'local-llama',
          providers: [
            {
              id: 'atomic-chat',
              kind: 'openai-compatible',
              baseUrl: base,
              apiKeyEnvVar: 'ATC_AGENT_API_KEY',
              defaultChatModel: model,
              supportsTools: true,
              requestTimeoutMs: 300000,
            },
            {
              id: 'local-llama',
              kind: 'llama-server',
              url: 'http://127.0.0.1:8080',
              baseUrl: 'http://127.0.0.1:8081',
            },
          ],
          fallback: { chain: [], appendLocal: false },
        },
        localModels: { mode: 'external' },
      },
    }
  if (id === 'claude') {
    if (!base.endsWith('/v1')) throw new Error('Claude Code requires an API prefix ending in /v1.')
    return {
      args: ['--model', model],
      env: {
        ANTHROPIC_BASE_URL: base.slice(0, -3),
        ANTHROPIC_AUTH_TOKEN: credential,
        ANTHROPIC_API_KEY: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        ANTHROPIC_MODEL: model,
        ANTHROPIC_DEFAULT_OPUS_MODEL: model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    }
  }
  const provider =
    major >= 2
      ? {
          name: 'Atomic Chat',
          env: ['ATC_AGENT_API_KEY'],
          package: '@opencode/ai/providers/openai-compatible',
          settings: { baseURL: base, apiKey: '{env:ATC_AGENT_API_KEY}' },
          models: { [model]: { name: model } },
        }
      : {
          npm: '@ai-sdk/openai-compatible',
          name: 'Atomic Chat',
          options: { baseURL: base, apiKey: '{env:ATC_AGENT_API_KEY}' },
          models: { [model]: { name: model } },
        }
  const config = {
    model: `atomic-chat/${model}`,
    [major >= 2 ? 'providers' : 'provider']: { 'atomic-chat': provider },
  }
  // v2 uses a separate launch workspace with the published project config format.
  return {
    args: ['--model', `atomic-chat/${model}`],
    env: {
      ATC_AGENT_API_KEY: credential,
      ...(major < 2 ? { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } : {}),
    },
    ...(major >= 2 ? { config } : {}),
  }
}
