import { coerceValue, fieldFor } from '../../../config/index.js'
import type { ActionContext } from '../actions.js'
export async function settingsDraftAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (s.busy && (id.startsWith('setting:') || id.startsWith('settings-'))) return true
  if (id.startsWith('settings-expand:')) {
    const group = id.slice(16)
    ctx.update((v) => ({
      ...v,
      settingsExpanded: v.settingsExpanded.includes(group)
        ? v.settingsExpanded.filter((item) => item !== group)
        : [...v.settingsExpanded, group],
      focus: id,
    }))
    return true
  }
  if (s.overlay === 'config-choice' && (id === 'close' || id.startsWith('config-choice:'))) {
    const row = s.base.config.rows.find((r) => `setting:${r.path}` === s.edit)
    const value = row?.values?.[Number(id.slice(14))]
    ctx.update((v) => ({
      ...v,
      ...(id !== 'close' && row && value !== undefined
        ? { configDraft: { ...v.configDraft, [row.path]: value } }
        : {}),
      overlay: null,
      edit: '',
      focus: s.edit,
    }))
    return true
  }
  if (id === 'settings-discard') {
    ctx.update((v) => ({ ...v, configDraft: {}, message: 'Changes discarded.' }))
    return true
  }
  if (id === 'settings-save') {
    const values = Object.fromEntries(
      Object.entries(s.configDraft).map(([path, raw]) => {
        const field = fieldFor(path)
        if (!field) throw new Error(`Unknown setting: ${path}`)
        return [path, coerceValue(field, raw)]
      })
    )
    ctx.update((v) => ({ ...v, busy: true, message: 'Saving…' }))
    try {
      await ctx.controller.runtime.execute('config.update', { values })
      if (s.workspace?.api.running && Object.keys(values).some((key) => key.startsWith('api.')))
        await ctx.controller.runtime.execute('api.restart')
      await ctx.controller.run({ name: 'refresh' })
      ctx.update((v) => ({ ...v, configDraft: {}, message: 'Changes saved.' }))
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  if (id.startsWith('setting:')) {
    const row = s.base.config.rows.find((r) => r.path === id.slice(8))
    if (!row) return true
    const current = s.configDraft[row.path] ?? row.value
    if (row.type === 'boolean')
      ctx.update((v) => ({
        ...v,
        configDraft: { ...v.configDraft, [row.path]: current === 'true' ? 'false' : 'true' },
      }))
    else if (row.type === 'enum' && row.values?.length)
      ctx.update((v) => ({
        ...v,
        overlay: 'config-choice',
        edit: id,
        focus: `config-choice:${Math.max(0, row.values!.indexOf(current))}`,
      }))
    else ctx.update((v) => ({ ...v, overlay: 'endpoint', edit: id, editValue: current, focus: 'save-edit' }))
    return true
  }
  if (id === 'save-edit' && s.edit.startsWith('setting:')) {
    const path = s.edit.slice(8)
    ctx.update((v) => ({
      ...v,
      configDraft: { ...v.configDraft, [path]: s.editValue },
      overlay: null,
      edit: '',
      editValue: '',
      focus: `setting:${path}`,
      message: 'You have unsaved changes.',
    }))
    return true
  }
  return false
}
