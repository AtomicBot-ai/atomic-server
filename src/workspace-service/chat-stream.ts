import { object } from './validation.js'

/** OpenAI SSE accumulation, including split tool arguments, reasoning and final usage. */
export async function readChatStream(response: Response, onChunk: (value: Record<string, unknown>) => void) {
  if (!response.ok) {
    const body = object(await response.json().catch(() => ({})))
    throw new Error(
      String(object(body['error'])['message'] ?? `Generation returned HTTP ${response.status}.`)
    )
  }
  if (!response.body) throw new Error('The engine returned an empty response.')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let buffer = '',
    finished = false
  try {
    while (true) {
      const next = await reader.read()
      buffer += decoder.decode(next.value, { stream: !next.done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      if (next.done && buffer) lines.push(buffer)
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') return
        const chunk = object(JSON.parse(data))
        if (chunk['error']) throw new Error(String(object(chunk['error'])['message'] ?? 'Generation failed.'))
        onChunk(chunk)
        const choice = object((chunk['choices'] as unknown[] | undefined)?.[0])
        if (choice['finish_reason']) finished = true
      }
      if (buffer.length > 8 * 1024 * 1024) throw new Error('An engine stream frame exceeded 8 MB.')
      if (next.done) {
        if (!finished) throw new Error('The stream ended unexpectedly. The partial answer is saved.')
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function mergeChatDelta(message: Record<string, unknown>, delta: Record<string, unknown>) {
  for (const key of ['content', 'reasoning_content'])
    if (typeof delta[key] === 'string') message[key] = String(message[key] ?? '') + delta[key]
  if (Array.isArray(delta['tool_calls'])) {
    const tools = (message['tool_calls'] ??= []) as Record<string, unknown>[]
    for (const value of delta['tool_calls']) {
      const part = object(value),
        index = Number(part['index'] ?? 0)
      if (!Number.isInteger(index) || index < 0 || index > 128) throw new Error('Invalid tool-call index.')
      const tool = (tools[index] ??= { type: 'function', function: { name: '', arguments: '' } })
      if (part['id']) tool['id'] = part['id']
      const fn = object(tool['function']),
        addition = object(part['function'])
      for (const key of ['name', 'arguments'])
        if (typeof addition[key] === 'string') fn[key] = String(fn[key] ?? '') + addition[key]
      tool['function'] = fn
    }
  }
}
