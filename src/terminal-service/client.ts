/** Public OpenAI-compatible calls shared by the terminal and plain chat command. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
export type ChatContent = string | ChatContentPart[]
export function messageText(content: ChatContent): string {
  return typeof content === 'string'
    ? content
    : content.map((p) => (p.type === 'text' ? p.text : '[Image]')).join('\n')
}
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: ChatContent
}
export function endpointUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Use an HTTP endpoint without credentials, a query, or a fragment.')
  return url.toString().replace(/\/$/, '')
}
export async function listChatModels(
  endpoint: string,
  request: typeof fetch,
  key = '',
  signal?: AbortSignal
): Promise<string[]> {
  const response = await request(`${endpointUrl(endpoint)}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: signal ?? AbortSignal.timeout(10000),
    redirect: 'error',
  })
  if (!response.ok)
    throw new Error(`Model list returned HTTP ${response.status}. Check the endpoint and API key.`)
  const data = (await response.json()) as { data?: { id?: unknown }[] }
  return (data.data ?? []).flatMap((m) => (typeof m.id === 'string' ? [m.id] : []))
}
export async function streamChat(options: {
  endpoint: string
  model: string
  messages: ChatMessage[]
  key?: string
  request: typeof fetch
  signal: AbortSignal
  onText: (text: string) => void
}): Promise<void> {
  const response = await options.request(`${endpointUrl(options.endpoint)}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
    },
    body: JSON.stringify({ model: options.model, messages: options.messages, stream: true }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      `Request returned HTTP ${response.status}. Check the model, endpoint, and access settings.`
    )
  }
  if (!response.body) throw new Error('The server returned an empty response.')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let buffer = '',
    done = false
  try {
    while (!done) {
      const next = await reader.read()
      buffer += decoder.decode(next.value, { stream: !next.done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      if (next.done && buffer) {
        lines.push(buffer)
        buffer = ''
      }
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const value = line.slice(5).trim()
        if (value === '[DONE]') {
          done = true
          break
        }
        if (!value) continue
        const chunk = JSON.parse(value) as {
          error?: { message?: string }
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
        }
        if (chunk.error) throw new Error('The server reported a generation error. Inspect the server log.')
        const text = chunk.choices?.[0]?.delta?.content
        if (text) options.onText(text)
        if (chunk.choices?.[0]?.finish_reason) done = true
      }
      if (next.done) {
        if (!done) throw new Error('The response ended before completion. The partial reply is kept.')
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
