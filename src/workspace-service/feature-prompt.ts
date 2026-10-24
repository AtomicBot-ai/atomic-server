import type { WorkspaceFeatures } from '../contract/index.js'
import { object } from './validation.js'
/** Build a wire request without mutating the conversation's saved messages or feature choices. */
export function featurePrompt(state: WorkspaceFeatures, body: Record<string, unknown>) {
  const {
    atomic_assistant,
    atomic_skills,
    atomic_connectors: _connectors,
    atomic_system: _system,
    ...wire
  } = body
  const selected =
    atomic_assistant === 'none'
      ? undefined
      : state.assistants.find((a) => a.id === (atomic_assistant || state.default_assistant))
  const messages = Array.isArray(wire['messages']) ? [...wire['messages']] : []
  const hasSystem = messages.some((m) => object(m)['role'] === 'system')
  const instructions =
    selected && (atomic_assistant || !hasSystem)
      ? selected.instructions.replaceAll('{{current_date}}', new Date().toISOString().slice(0, 10))
      : ''
  const skills = state.skills.filter(
    (s) => s.enabled && Array.isArray(atomic_skills) && atomic_skills.includes(s.name)
  )
  const prompt = [instructions, ...skills.map((s) => `Skill: ${s.name}\n${s.body}`)]
    .filter(Boolean)
    .join('\n\n')
  if (prompt) messages.unshift({ role: 'system', content: prompt })
  return { ...(selected?.parameters ?? {}), ...wire, messages }
}
