/** Shared atomic-chat-ui first run and connection guide routes. */
export const FIRST_RUN_STEPS = ['model', 'permissions', 'cloud', 'media', 'connect'] as const
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number]
export const FIRST_RUN_TITLES: Record<FirstRunStep, string> = {
  model: 'Choose your first model',
  permissions: 'Permissions',
  cloud: 'Cloud providers',
  media: 'Image and video models',
  connect: 'How will you use Atomic Server?',
}
export const CONNECTION_AGENTS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'atomic-agent', label: 'Atomic Agent' },
  { id: 'kilo', label: 'Kilo Code' },
  { id: 'pi', label: 'pi' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'openclaude', label: 'OpenClaude' },
  { id: 'cline', label: 'Cline CLI' },
  { id: 'dsh', label: 'DeepSeek Harness' },
  { id: 'zed', label: 'Zed' },
  { id: 'zcode', label: 'ZCode' },
  { id: 'mimo', label: 'MiMo Code' },
  { id: 'droid', label: 'Droid' },
  { id: 'copilot', label: 'Copilot CLI' },
  { id: 'openhands', label: 'OpenHands' },
  { id: 'poolside', label: 'Poolside' },
  { id: 'goose', label: 'Goose' },
  { id: 'muse', label: 'Muse Code' },
  { id: 'hermes', label: 'Hermes Agent' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'jetbrains', label: 'JetBrains' },
  { id: 'xcode', label: 'Xcode' },
] as const
export type ConnectionStep = 'choose' | 'agent' | 'endpoint' | 'review' | 'preparing' | 'done'
export const DESKTOP_PERMISSIONS = [
  { label: 'Notifications', detail: 'Desktop notifications are not available from the server.' },
  { label: 'Microphone', detail: 'Agents manage microphone access on their own device.' },
  { label: 'Files', detail: 'Import model files from Models. Agents manage their own file access.' },
] as const
export interface ConnectionDraft {
  step: ConnectionStep
  pickingModel?: boolean
  path: 'agent' | 'endpoint'
  agent: string
  model: string
  provider: string
  port: string
  more: boolean
  agentPage: number
  status: string
  error: string
  command: string
  endpoint: string
  keyId: string
}
export interface CloudDraft {
  optionsOpen?: boolean
  provider: string
  url: string
  key: string
  models: string
  editing: boolean
  error: string
  checking?: boolean
  providers: {
    provider: string
    base_url?: string
    models?: string[]
    has_api_key?: boolean
    connected?: boolean
    checked_at?: number
  }[]
}

export const PROFILE_AGENTS: readonly string[] = ['claude', 'codex', 'atomic-agent', 'opencode']

/** This server checks OpenAI-compatible endpoints; native desktop adapters are unavailable. */
export const CLOUD_CONNECTION_NOTES: Readonly<Record<string, string>> = {
  'anthropic': 'Use an OpenAI-compatible gateway. The native Anthropic API is not supported here.',
  'chatgpt': 'Use an OpenAI-compatible gateway. ChatGPT browser sign-in is not supported here.',
  'automatic1111':
    'Use an OpenAI-compatible gateway. The native Automatic1111 / Forge API is not supported here.',
  'sdcpp-server': 'Use an OpenAI-compatible gateway. Native image endpoints are not supported here.',
}

/** Provider order follows the desktop onboarding catalog; URLs remain user-configurable. */
export const CLOUD_CATALOG = [
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', icon: '(*)' },
  { id: 'anthropic', name: 'Anthropic', url: '', icon: '/A/' },
  { id: 'google', name: 'Google', url: '', icon: '<G>' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', icon: '<->' },
  { id: 'chatgpt', name: 'ChatGPT', url: '', icon: '(*)' },
  { id: 'deepseek', name: 'DeepSeek', url: '', icon: '~D~' },
  { id: 'xai', name: 'xAI', url: '', icon: '/X/' },
  { id: 'groq', name: 'Groq', url: '', icon: '[g]' },
  { id: 'mistral', name: 'Mistral', url: '', icon: '[M]' },
  { id: 'llamacpp-server', name: 'llama.cpp server', url: '', icon: '[L]' },
  { id: 'automatic1111', name: 'Automatic1111 / Forge', url: '', icon: '[A]' },
  { id: 'sdcpp-server', name: 'stable-diffusion.cpp server', url: '', icon: '[S]' },
  { id: 'azure', name: 'Azure', url: '', icon: '[A]' },
] as const
