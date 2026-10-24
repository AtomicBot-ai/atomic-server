import type { ActionContext } from '../action-types.js'
import { featureDraft } from '../server/feature-model.js'

import { parameterValues } from './parameter-values.js'
import { CHAT_PARAMETER_FIELDS } from './parameter-values.js'
const keys = new Set(CHAT_PARAMETER_FIELDS.map(([key]) => key))
export async function chatParametersAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (id === 'chat-parameters') {
    const prefs = s.chatPreferences ?? s.conversation?.request_settings ?? {},
      value: Record<string, unknown> = {},
      extra: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(prefs))
      if (keys.has(key)) value[key] = v
      else if (!key.startsWith('atomic_')) extra[key] = v
    const system = s.messages.find((m) => m.role === 'system')?.content
    value['system'] = prefs['atomic_system'] ?? (typeof system === 'string' ? system : '')
    value['parameters'] = extra
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-editor',
      featureEditor: featureDraft('chat-parameters', value),
      focus: 'feature-field:system',
      message: '',
    }))
    return true
  }
  if (s.overlay !== 'feature-editor' || s.featureEditor?.kind !== 'chat-parameters') return false
  if (id === 'close') {
    ctx.update((v) => ({
      ...v,
      overlay: null,
      featureEditor: undefined,
      focus: 'chat-parameters',
      message: '',
    }))
    return true
  }
  if (id !== 'feature-save') return false
  if (s.generating) throw new Error('Wait for the response to finish before changing request parameters.')
  const chosen = Object.fromEntries(
    Object.entries(s.chatPreferences ?? s.conversation?.request_settings ?? {}).filter(([key]) =>
      key.startsWith('atomic_')
    )
  )
  const prefs = { ...chosen, ...parameterValues(s.featureEditor.value) }
  ctx.update((v) => ({
    ...v,
    chatPreferences: prefs,
    overlay: null,
    featureEditor: undefined,
    focus: 'chat-parameters',
    message: '',
  }))
  return true
}
