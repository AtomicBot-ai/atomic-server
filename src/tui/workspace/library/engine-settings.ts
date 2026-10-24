import { engineSettingOptions } from './engine-setting-options.js'
/**
 * The engine panel's settings form (spec server-engine-settings, "Настройки движка в TUI и admin"):
 * fields from `settings.schema`, a checkbox toggled, a dropdown and `gpu_id` (the environment's cards)
 * chosen from an inline list, a number or text edited in the same popup and checked against its descriptor; Save sends
 * only what changed through `settings.update` with the revision read when the form opened.
 */

import type { EnvironmentSnapshot, SettingDescriptor } from '@atomic-chat/core/contracts'
import { changedValues, fieldValue, parseSettingValue } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { EngineForm, EnginePanel } from './engine-panel-model.js'

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>
const EDIT = 'engine-setting:'

export async function readEngineForm(ctx: PanelContext, p: EnginePanel): Promise<EngineForm> {
  const run = ctx.controller.runtime
  const [schema, current, environments] = await Promise.all([
    run.execute('settings.schema', { provider: p.engine }) as Promise<{ descriptors: SettingDescriptor[] }>,
    run.execute('settings.get', { provider: p.engine }) as Promise<{
      revision?: number
      values?: Record<string, unknown>
    }>,
    p.kind === 'managed'
      ? (run.execute('environments.list').catch(() => []) as Promise<EnvironmentSnapshot[]>)
      : Promise.resolve([] as EnvironmentSnapshot[]),
  ])
  return {
    descriptors: schema.descriptors ?? [],
    values: current.values ?? {},
    revision: current.revision,
    draft: {},
    gpus: (Array.isArray(environments) ? environments[0]?.gpus : undefined) ?? [],
  }
}

export async function settingsAction(id: string, ctx: PanelContext): Promise<boolean> {
  const s = ctx.get(),
    p = s.enginePanel
  if (!p) return false
  const set = (part: Partial<EnginePanel>) =>
    ctx.update((v) =>
      v.enginePanel?.engine === p.engine ? { ...v, enginePanel: { ...v.enginePanel, ...part } } : v
    )
  if (p.busy && (id.startsWith('engine-setting') || id.startsWith('engine-option:'))) return true
  const editing = (s.overlay === 'endpoint' || s.overlay === 'engine-panel') && s.edit.startsWith(EDIT)
  if (editing && (id === 'engine-settings-save' || (id.startsWith(EDIT) && id !== s.edit))) {
    await settingsAction('engine-setting-commit', ctx)
    if (ctx.get().enginePanel?.error) return true
    return settingsAction(id, ctx)
  }
  if (editing && ['save-edit', 'engine-setting-commit', 'engine-setting-cancel'].includes(id)) {
    const key = s.edit.slice(EDIT.length),
      d = p.form?.descriptors.find((x) => x.key === key)
    ctx.update((v) => ({ ...v, overlay: 'engine-panel', edit: '', focus: s.edit }))
    if (id === 'engine-setting-cancel' || !d || !p.form) return true
    const parsed = parseSettingValue(d, s.editValue)
    if ('error' in parsed) set({ error: parsed.error })
    else set({ error: '', form: { ...p.form, draft: { ...p.form.draft, [key]: parsed.value } } })
    return true
  }
  if (s.overlay !== 'engine-panel') return false
  if (id === 'engine-settings') {
    set({ busy: true, error: '', notice: '' })
    try {
      set({ form: await readEngineForm(ctx, p), busy: false })
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
    return true
  }
  if (id === 'engine-settings-back') return (set({ mode: 'engine', error: '', notice: '' }), true)
  const f = p.form
  if (!f) return false
  if (id === 'engine-choice-close') {
    set({ choice: '' })
    return true
  }
  if (id.startsWith('engine-option:')) {
    const d = f.descriptors.find((field) => field.key === p.choice)
    const option = d && engineSettingOptions(p, d)[Number(id.slice(14))]
    if (option && d) {
      set({ choice: '', error: '', form: { ...f, draft: { ...f.draft, [d.key]: option.value } } })
      ctx.update((v) => ({ ...v, focus: `${EDIT}${d.key}` }))
    }
    return true
  }
  if (id.startsWith(EDIT)) {
    if (editing && s.edit === id) return true
    const d = f.descriptors.find((x) => x.key === id.slice(EDIT.length))
    if (!d) return true
    const value = fieldValue(d, f.values, f.draft)
    const draft = (v: unknown) => set({ error: '', form: { ...f, draft: { ...f.draft, [d.key]: v } } })
    if (d.controllerType === 'checkbox') draft(value !== true)
    else if (engineSettingOptions(p, d).length) set({ choice: p.choice === d.key ? '' : d.key })
    else
      ctx.update((v) => ({
        ...v,
        overlay: 'engine-panel',
        edit: id,
        editValue: String(value ?? ''),
        focus: id,
      }))
    return true
  }
  if (id === 'engine-settings-save') {
    const values = changedValues(f.values, f.draft, f.descriptors)
    if (!Object.keys(values).length) return (set({ notice: 'Nothing changed.' }), true)
    set({ busy: true, error: '', notice: '' })
    try {
      await ctx.controller.runtime.execute('settings.update', {
        provider: p.engine,
        values,
        ...(f.revision !== undefined ? { expected_revision: f.revision } : {}),
      })
      set({
        form: await readEngineForm(ctx, p),
        busy: false,
        notice: 'Saved. Applies from the next model load.',
      })
      ctx.update((v) => (v.enginePanel?.engine === p.engine ? { ...v, focus: 'close' } : v))
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
    return true
  }
  return false
}
