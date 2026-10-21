/**
 * The engine panel's settings form (spec server-engine-settings, "Настройки движка в TUI и admin"):
 * fields from `settings.schema`, a checkbox toggled, a dropdown and `gpu_id` (the environment's cards)
 * cycled, a number or text edited in the edit overlay and checked against its descriptor; Save sends
 * only what changed through `settings.update` with the revision read when the form opened.
 */

import type { EnvironmentSnapshot, GpuFacts, SettingDescriptor } from '@atomic-chat/core/contracts'
import { changedValues, fieldValue, parseSettingValue } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { EngineForm, EnginePanel } from './engine-panel-model.js'

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>
const EDIT = 'engine-setting:'

function set(ctx: PanelContext, part: Partial<EnginePanel>) {
  ctx.update((v) => (v.enginePanel ? { ...v, enginePanel: { ...v.enginePanel, ...part } } : v))
}

async function readForm(ctx: PanelContext, p: EnginePanel): Promise<EngineForm> {
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
    descriptors: schema.descriptors,
    values: current.values ?? {},
    revision: current.revision,
    draft: {},
    gpus: (Array.isArray(environments) ? environments[0]?.gpus : undefined) ?? [],
  }
}

/** Next of `choices` after `value`, wrapping. */
const next = <T>(choices: readonly T[], value: T) => choices[(choices.indexOf(value) + 1) % choices.length]!

export async function settingsAction(id: string, ctx: PanelContext): Promise<boolean> {
  const s = ctx.get(),
    p = s.enginePanel
  if (!p) return false
  const editing = s.overlay === 'endpoint' && s.edit.startsWith(EDIT)
  if (editing && (id === 'save-edit' || id === 'close')) {
    const key = s.edit.slice(EDIT.length),
      d = p.form?.descriptors.find((x) => x.key === key)
    ctx.update((v) => ({ ...v, overlay: 'engine-panel', edit: '', focus: s.edit }))
    if (id === 'close' || !d || !p.form) return true
    const parsed = parseSettingValue(d, s.editValue)
    if ('error' in parsed) set(ctx, { error: parsed.error })
    else set(ctx, { error: '', form: { ...p.form, draft: { ...p.form.draft, [key]: parsed.value } } })
    return true
  }
  if (s.overlay !== 'engine-panel') return false
  if (id === 'engine-settings') {
    set(ctx, { mode: 'settings', busy: true, error: '', notice: '' })
    try {
      set(ctx, { form: await readForm(ctx, p), busy: false })
    } catch (e) {
      set(ctx, { busy: false, error: e instanceof Error ? e.message : String(e) })
    }
    return true
  }
  if (id === 'engine-settings-back')
    return (set(ctx, { mode: 'engine', form: null, error: '', notice: '' }), true)
  const f = p.form
  if (!f) return false
  if (id.startsWith(EDIT)) {
    const d = f.descriptors.find((x) => x.key === id.slice(EDIT.length))
    if (!d) return true
    const value = fieldValue(d, f.values, f.draft)
    const draft = (v: unknown) => set(ctx, { error: '', form: { ...f, draft: { ...f.draft, [d.key]: v } } })
    if (d.controllerType === 'checkbox') draft(value !== true)
    else if (d.key === 'gpu_id' && p.kind === 'managed')
      draft(next(['', ...f.gpus.map((g: GpuFacts) => g.gpu_id)], value ?? ''))
    else if (d.controllerType === 'dropdown' && Array.isArray(d.controllerProps['options']))
      draft(
        next(
          (d.controllerProps['options'] as Array<{ value: unknown }>).map((o) => o.value),
          value
        )
      )
    else
      ctx.update((v) => ({
        ...v,
        overlay: 'endpoint',
        edit: id,
        editValue: String(value ?? ''),
        focus: 'save-edit',
      }))
    return true
  }
  if (id === 'engine-settings-save') {
    const values = changedValues(f.values, f.draft)
    if (!Object.keys(values).length) return (set(ctx, { notice: 'Nothing changed.' }), true)
    set(ctx, { busy: true, error: '', notice: '' })
    try {
      await ctx.controller.runtime.execute('settings.update', {
        provider: p.engine,
        values,
        ...(f.revision !== undefined ? { expected_revision: f.revision } : {}),
      })
      set(ctx, {
        form: await readForm(ctx, p),
        busy: false,
        notice: 'Saved. Applies from the next model load.',
      })
    } catch (e) {
      set(ctx, { busy: false, error: e instanceof Error ? e.message : String(e) })
    }
    return true
  }
  return false
}
