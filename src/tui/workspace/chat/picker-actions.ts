import { engineName } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { isPicker, pickerRows } from './picker.js'
import type { WorkspaceController } from '../controller.js'
const reads = new WeakMap<WorkspaceController, number>()
export async function pickerAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, update, controller: c } = ctx,
    s = get()
  const patch = (p: Partial<WorkspaceState>) => update((v) => ({ ...v, ...p }))
  if (id === 'choose-model' || id === 'choose-engine' || id === 'picker-refresh') {
    const overlay = id === 'choose-model' ? 'model-picker' : 'engine-picker'
    if (s.overlay === overlay && id !== 'picker-refresh') {
      patch({ overlay: null, focus: 'composer', hover: '' })
      return true
    }
    const revision = (reads.get(c) ?? 0) + 1
    reads.set(c, revision)
    const fresh = () => reads.get(c) === revision
    patch({ overlay, pickerBusy: true, pickerError: '', hover: '', message: '' })
    const focusFirst = () =>
      update((v) => ({
        ...v,
        ...(v.overlay === overlay
          ? {
              focus: pickerRows(v).find((r) => r.current)?.id ?? pickerRows(v)[0]?.id ?? '',
            }
          : {}),
      }))
    focusFirst()
    try {
      if (overlay === 'engine-picker') {
        const engines = await c.engineSelection.list(await c.setup.catalogs())
        if (fresh()) patch({ engines })
      } else {
        const [local, remote] = await Promise.allSettled([c.installed(), c.models(s.endpoint)])
        if (fresh())
          patch({
            installed: local.status === 'fulfilled' ? local.value : s.installed,
            models: remote.status === 'fulfilled' ? remote.value : [],
            modelsError: remote.status === 'rejected' ? 'Endpoint offline.' : '',
            pickerError: local.status === 'rejected' ? 'Could not read local models. Close and retry.' : '',
          })
      }
      if (fresh()) focusFirst()
    } catch (e) {
      if (fresh()) patch({ pickerError: e instanceof Error ? e.message : 'Could not refresh. Try again.' })
    } finally {
      if (fresh()) patch({ pickerBusy: false })
    }
    return true
  }
  if (id.startsWith('pick-engine:')) {
    if (s.pickerBusy) return true
    if (s.generating) {
      patch({ pickerError: 'Stop the response before switching engines.' })
      return true
    }
    const engine = s.engines[Number(id.slice(12))]
    if (!engine) return true
    patch({
      pickerBusy: true,
      pickerError: '',
      message: engine.installed ? 'Switching engine…' : `Installing ${engineName(engine.provider)}…`,
    })
    try {
      await c.engineSelection.select(engine)
      const local = s.installed.find((m) => m.id === s.model)
      const compatible =
        local &&
        (local.provider === engine.provider ||
          (['llamacpp', 'llamacpp-upstream'].includes(local.provider) &&
            ['llamacpp', 'llamacpp-upstream'].includes(engine.provider)))
      patch({ engine: engine.id, ...(local && !compatible ? { model: '' } : {}) })
      if (local && !compatible) await c.save('tui.model', '')
      if (compatible) {
        await c.loadModel(engine.provider, local.id)
        const endpoint = await c.localEndpoint()
        await c.save('tui.model', local.id)
        await c.save('tui.endpoint', endpoint)
        patch({ model: local.id, endpoint })
      }
      update((v) => ({
        ...v,
        engines: v.engines.map((e) => (e.id === engine.id ? { ...e, installed: true } : e)),
        ...(v.overlay === 'engine-picker' ? { overlay: null, focus: 'composer', hover: '' } : {}),
        message: `${engineName(engine.provider)} selected.${local && !compatible ? ' Choose a compatible model.' : ''}`,
      }))
    } catch (e) {
      patch({ pickerError: e instanceof Error ? e.message : 'Engine could not be selected.' })
    } finally {
      patch({ pickerBusy: false })
    }
    return true
  }
  if (isPicker(s.overlay) && (id.startsWith('model:') || id.startsWith('installed:')) && s.generating) {
    patch({ pickerError: 'Stop the response before switching models.' })
    return true
  }
  return false
}
