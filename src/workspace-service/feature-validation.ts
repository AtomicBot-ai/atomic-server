import { AtcError } from '../errors/index.js'
import { DEFAULT_ATTACHMENTS } from '../contract/index.js'
import type { AssistantProfile, AgentSkill, ConnectorConfig, AttachmentSettings } from '../contract/index.js'
import { object } from './validation.js'
const fail = (message: string): never => {
  throw new AtcError('ATC_USAGE', message)
}
function string(value: unknown, label: string, max = 100000) {
  if (typeof value !== 'string' || value.length > max)
    return fail(`${label} must be text up to ${max} characters.`)
  return value
}
function name(value: unknown) {
  const result = string(value, 'Name', 100).trim()
  if (!result) fail('Enter a name.')
  return result
}
function strings(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(object(value)).map(([k, v]) => [k, string(v, k, 10000)]))
}
export function assistantValue(raw: unknown, id: string): AssistantProfile {
  const v = object(raw),
    parameters: Record<string, number> = {}
  for (const [key, value] of Object.entries(object(v['parameters']))) {
    if (
      ![
        'temperature',
        'top_p',
        'top_k',
        'min_p',
        'repeat_penalty',
        'max_tokens',
        'frequency_penalty',
        'presence_penalty',
        'seed',
      ].includes(key)
    )
      fail(`Unsupported sampling setting: ${key}.`)
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${key} must be a finite number.`)
    parameters[key] = value as number
  }
  return {
    id,
    name: name(v['name']),
    avatar: string(v['avatar'] ?? '*', 'Avatar', 100),
    description: string(v['description'] ?? '', 'Description', 1000),
    instructions: string(v['instructions'] ?? '', 'Instructions'),
    parameters,
  }
}
export function skillValue(raw: unknown): AgentSkill {
  const v = object(raw),
    skillName = name(v['name'])
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(skillName))
    fail('Use lowercase letters, numbers and hyphens for the skill name.')
  return {
    name: skillName,
    description: string(v['description'] ?? '', 'Description', 1000),
    body: string(v['body'] ?? '', 'Instructions'),
    enabled: v['enabled'] !== false,
    updated_at: Date.now(),
  }
}
export function importSkill(content: string): AgentSkill {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content)
  if (!front) fail('Choose a SKILL.md with name and description frontmatter.')
  const value: Record<string, unknown> = { body: front![2] }
  for (const line of front![1]!.split(/\r?\n/)) {
    const field = /^(name|description):\s*(.*)$/.exec(line)
    if (field) value[field[1]!] = field[2]!.replace(/^["']|["']$/g, '')
  }
  return skillValue(value)
}
export function connectorValue(raw: unknown, id: string, prior?: ConnectorConfig): ConnectorConfig {
  const v = object(raw),
    type = v['type'] === 'stdio' ? 'stdio' : v['type'] === 'sse' ? 'sse' : 'http'
  const url = string(v['url'] ?? '', 'URL', 2000),
    command = string(v['command'] ?? '', 'Command', 2000)
  if (type !== 'stdio') {
    let valid = false
    try {
      valid = ['http:', 'https:'].includes(new URL(url).protocol)
    } catch {
      /* validation below */
    }
    if (!valid) fail('Enter an HTTP or HTTPS MCP URL.')
  } else if (!command.trim()) fail('Enter the command to launch the connector.')
  const secretMap = (key: 'headers' | 'env') =>
    Object.fromEntries(
      Object.entries(strings(v[key])).map(([k, val]) => [
        k,
        val === '••••••••' ? (prior?.[key][k] ?? '') : val,
      ])
    )
  const timeout = Number(v['timeout'] ?? 30)
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300)
    fail('Timeout must be between 1 and 300 seconds.')
  if (
    !Array.isArray(v['args'] ?? []) ||
    (v['args'] as unknown[] | undefined)?.some((a) => typeof a !== 'string')
  )
    fail('Arguments must be a JSON array of strings.')
  return {
    id,
    name: name(v['name']),
    type,
    url,
    command,
    args: (v['args'] ?? []) as string[],
    env: secretMap('env'),
    headers: secretMap('headers'),
    enabled: v['enabled'] !== false && v['active'] !== false,
    timeout,
  }
}
export function attachmentValue(raw: unknown, prior = DEFAULT_ATTACHMENTS): AttachmentSettings {
  const v = { ...prior, ...object(raw) }
  const limits: Record<string, [number, number]> = {
    max_file_size_mb: [1, 100],
    retrieval_limit: [1, 30],
    retrieval_threshold: [0, 1],
    chunk_size_chars: [200, 10000],
    overlap_chars: [0, 2000],
    max_image_size_px: [0, 8192],
    auto_inline_context_ratio: [0.05, 1],
  }
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = Number(v[key as keyof AttachmentSettings])
    if (!['retrieval_threshold', 'auto_inline_context_ratio'].includes(key) && !Number.isInteger(n))
      fail(`${key.replaceAll('_', ' ')} must be a whole number.`)
    if (!Number.isFinite(n) || n < min || n > max)
      fail(`${key.replaceAll('_', ' ')} must be between ${min} and ${max}.`)
    ;(v as unknown as Record<string, unknown>)[key] = n
  }
  if (v.overlap_chars >= v.chunk_size_chars) fail('Chunk overlap must be smaller than chunk size.')
  if (!['auto', 'inline', 'embeddings', 'retrieval'].includes(v.parse_mode))
    fail('Choose automatic, inline or retrieval parsing.')
  if (!['auto', 'linear'].includes(v.search_mode)) fail('Choose automatic or exact search.')
  return {
    ...v,
    embedding_model: string(v.embedding_model, 'Embedding model', 300),
    enabled: v.enabled === true,
  }
}
