import type { ActionContext } from '../actions.js'
import { persistConversation } from '../data-actions.js'
import { featureData, featureDraft } from './feature-model.js'
export async function profileAction(id: string, ctx: ActionContext) {
  const s = ctx.get()
  if (
    id === 'feature-skill-create' ||
    id === 'feature-assistant-default' ||
    id.startsWith('feature-skill-menu:')
  ) {
    const kind =
      id === 'feature-skill-create'
        ? 'skill-create-menu'
        : id === 'feature-assistant-default'
          ? 'assistant-default'
          : 'skill-menu'
    const key = id.slice('feature-skill-menu:'.length)
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-editor',
      featureEditor: featureDraft(kind, { id: key }),
      focus:
        kind === 'skill-create-menu'
          ? 'feature-add'
          : kind === 'assistant-default'
            ? `feature-default:${featureData(s).default_assistant}`
            : `feature-try:${key}`,
    }))
    return true
  }
  if (id.startsWith('feature-select:')) {
    ctx.update((v) => ({ ...v, featureSelection: id.slice(15), focus: id, scroll: 0 }))
    return true
  }
  if (id.startsWith('feature-try:')) {
    const name = id.slice(12),
      skill = featureData(s).skills.find((item) => item.name === name)
    if (!skill?.enabled) throw new Error('Enable this skill before trying it in chat.')
    await persistConversation(ctx)
    ctx.update((v) => ({
      ...v,
      page: 'chat',
      conversation: null,
      messages: [],
      draft: '',
      images: [],
      documents: [],
      overlay: null,
      featureEditor: undefined,
      focus: 'composer',
      chatPreferences: { atomic_skills: [name] },
      cursor: 0,
      scroll: 0,
    }))
    return true
  }
  return false
}
