/** Build controls remain in the engine dialog and use the core's public operations. */
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { EnginePanel, PanelButton } from './engine-panel-model.js'
import { record } from './library-model.js'
import { engineUpdateResult } from '../../../workspace-view/index.js'

type Context = Pick<ActionContext, 'get' | 'update' | 'controller'>
export function buildFields(p: EnginePanel): PanelButton[] {
  return (p.builds ?? []).flatMap((build, index) => {
    const label = `${String(build['version'])} · ${String(build['variant'])}`
    const result = [
      {
        id: `engine-build:${index}`,
        label: `${label}${build['active'] ? '  [Active]' : build['in_use'] ? '  [In use]' : ''}`,
        hint: 'Installed build',
      },
    ]
    if (!build['active'] && p.activeChoice === 'client')
      result.push({ id: `engine-build-activate:${index}`, label: '  Activate this build', hint: label })
    if (build['removable'])
      result.push({ id: `engine-build-remove:${index}`, label: '  Remove build', hint: label })
    if (p.removeBuild === index)
      result.push(
        {
          id: `engine-build-confirm:${index}`,
          label: `  Remove ${label}? Confirm`,
          hint: 'Delete this installed engine build',
        },
        { id: 'engine-build-keep', label: '  Keep build', hint: 'Cancel removal' }
      )
    return result
  })
}
export async function readBuilds(ctx: Context, force = false) {
  const engine = ctx.get().enginePanel?.engine
  if (!engine) return
  const check = (phase: 'checking' | 'error', message: string) =>
    ctx.update((s) =>
      s.enginePanel?.engine !== engine
        ? s
        : { ...s, enginePanel: { ...s.enginePanel, updateCheck: { phase, message } } }
    )
  if (force) check('checking', 'Checking for updates…')
  try {
    const response = await ctx.controller.runtime.execute('engines.list', force ? { force: true } : {})
    const all = Array.isArray(response) ? response : record(response)['engines']
    const source = (Array.isArray(all) ? all.map(record) : []).find((row) => row['engine'] === engine)
    if (source) ctx.update((s) => withEngineBuilds(s, engine, source, force))
    else if (force) check('error', 'This engine was not returned. Check again.')
  } catch (error) {
    if (force)
      check('error', `Could not check for updates: ${error instanceof Error ? error.message : String(error)}`)
    else throw error
  }
}
export function withEngineBuilds(
  s: WorkspaceState,
  engine: string,
  source: Record<string, unknown>,
  checked = false
): WorkspaceState {
  if (s.enginePanel?.engine !== engine) return s
  return {
    ...s,
    enginePanel: {
      ...s.enginePanel,
      builds: Array.isArray(source['builds']) ? source['builds'].map(record) : [],
      activeChoice: String(source['active_choice'] ?? ''),
      buildInstalled: Boolean(source['active']),
      summary: source['active'] ? String(record(source['active'])['version']) : 'Not installed',
      ...(checked ? { updateCheck: engineUpdateResult(source) } : {}),
      ...(!checked && source['source_error'] ? { error: String(source['source_error']) } : {}),
    },
  }
}

export async function buildAction(id: string, ctx: Context) {
  const p = ctx.get().enginePanel
  if (!p || ctx.get().overlay !== 'engine-panel') return false
  const update = (part: Partial<EnginePanel>) =>
    ctx.update((s) =>
      s.enginePanel?.engine !== p.engine ? s : { ...s, enginePanel: { ...s.enginePanel, ...part } }
    )
  if (id === 'engine-build-keep') {
    update({ removeBuild: undefined })
    return true
  }
  if (id.startsWith('engine-build-remove:')) {
    update({ removeBuild: Number(id.split(':')[1]) })
    return true
  }
  if (
    !id.startsWith('engine-build-activate:') &&
    !id.startsWith('engine-build-confirm:') &&
    id !== 'engine-install'
  )
    return id.startsWith('engine-build:')
  if (p.busy || p.updateCheck?.phase === 'checking') return true
  if (id === 'engine-install' && p.buildInstalled && p.updateCheck?.phase !== 'available') return true
  const build = p.builds?.[Number(id.split(':')[1])]
  if (id !== 'engine-install' && !build) return true
  update({ busy: true, error: '' })
  try {
    if (id === 'engine-install') await ctx.controller.runtime.execute('engines.enqueue', { engine: p.engine })
    else
      await ctx.controller.runtime.execute(
        id.startsWith('engine-build-confirm:') ? 'engines.remove' : 'engines.activate',
        {
          engine: p.engine,
          version: build!['version'],
          variant: build!['variant'],
        }
      )
    update({ removeBuild: undefined })
    if (id === 'engine-install') update({ updateCheck: { phase: 'idle', message: 'Download queued.' } })
    await readBuilds(ctx)
  } catch (error) {
    update({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    update({ busy: false })
  }
  return true
}
