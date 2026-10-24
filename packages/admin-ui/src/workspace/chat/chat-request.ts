import type { WorkspaceServiceRow } from '@contract'
import type { connectorToolBindings } from '@view'
import type { ChatFeatureSelection } from './ChatFeaturePicker'
import { record, rows } from '../types'

export function chatRequest(
  parameters: string,
  service: WorkspaceServiceRow | undefined,
  features: ChatFeatureSelection,
  bindings: ReturnType<typeof connectorToolBindings>
) {
  let value: unknown
  try {
    value = JSON.parse(parameters)
  } catch {
    throw new Error(
      'Request JSON is invalid. Fix it under Additional engine parameters & tools; your message is kept.'
    )
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Request JSON must be an object.')
  if (!service) throw new Error('Load and select a ready model in Engines & Models.')
  const parametersValue = record(value)
  const tools = rows(parametersValue.tools).filter(
    (tool) => !/^mcp_[0-9a-f]{1,8}_/.test(String(record(tool.function).name ?? ''))
  )
  const currentTools = [...tools, ...bindings.map((binding) => binding.definition)]
  return {
    ...parametersValue,
    model: service.model,
    atomic_assistant: features.assistant,
    atomic_skills: features.skills,
    atomic_connectors: features.connectors,
    ...('tools' in parametersValue || currentTools.length ? { tools: currentTools } : {}),
  }
}
