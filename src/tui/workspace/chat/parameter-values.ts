export const CHAT_PARAMETER_FIELDS: [string, string][] = [
  ['system', 'System prompt'],
  ['temperature', 'Temperature'],
  ['max_tokens', 'Maximum output tokens'],
  ['top_p', 'Top P'],
  ['presence_penalty', 'Presence penalty'],
  ['frequency_penalty', 'Frequency penalty'],
  ['seed', 'Seed'],
  ['parameters', 'Additional request parameters (JSON)'],
]
const limits: Record<string, [number, number, boolean?]> = {
  temperature: [0, 2],
  max_tokens: [1, Infinity, true],
  top_p: [0, 1],
  presence_penalty: [-2, 2],
  frequency_penalty: [-2, 2],
  seed: [0, Infinity, true],
}
export function parameterValues(value: Record<string, string>) {
  const extra: unknown = JSON.parse(value['parameters'] || '{}')
  if (!extra || typeof extra !== 'object' || Array.isArray(extra))
    throw new Error('Request parameters must be a JSON object.')
  const next: Record<string, unknown> = { ...extra }
  for (const key of Object.keys(next))
    if (key.startsWith('atomic_') || ['messages', 'model', 'stream', 'stream_options'].includes(key))
      throw new Error(`${key} is managed by the conversation.`)
  for (const [key, [min, max, integer]] of Object.entries(limits)) {
    const raw = value[key]?.trim() ?? ''
    if (!raw) continue
    const number = Number(raw)
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number)))
      throw new Error(`Enter a valid ${CHAT_PARAMETER_FIELDS.find(([id]) => id === key)![1].toLowerCase()}.`)
    next[key] = number
  }
  next['atomic_system'] = value['system'] ?? ''
  return next
}
