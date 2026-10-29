import type { WorkspaceState } from '../state.js'
import { featureData } from '../server/feature-model.js'

/** The full Tools menu, shared by drawing and navigation; empty IDs are section headings. */
export function chatFeatureRows(s: WorkspaceState): [string, string][] {
  const data = featureData(s),
    p = s.chatPreferences ?? s.conversation?.request_settings ?? {}
  return [
    ['', 'Assistant'],
    ...data.assistants.map((a): [string, string] => [
      `chat-assistant:${a.id}`,
      `${(p['atomic_assistant'] ?? data.default_assistant) === a.id ? '(o)' : '( )'} ${a.name}`,
    ]),
    ['chat-assistant:none', `${p['atomic_assistant'] === 'none' ? '(o)' : '( )'} No assistant`],
    ['', 'Skills'],
    ...data.skills
      .filter((k) => k.enabled)
      .map((k): [string, string] => [
        `chat-skill:${k.name}`,
        `${(p['atomic_skills'] as string[] | undefined)?.includes(k.name) ? '[x]' : '[ ]'} ${k.name}`,
      ]),
    ['', 'MCP connectors'],
    ...data.connectors
      .filter((k) => k.enabled)
      .map((k): [string, string] => [
        `chat-connector:${k.id}`,
        `${(p['atomic_connectors'] as string[] | undefined)?.includes(k.id) ? '[x]' : '[ ]'} ${k.name}`,
      ]),
  ]
}
