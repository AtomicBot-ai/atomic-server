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
