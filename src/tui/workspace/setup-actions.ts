import { newSetup, setupWait } from '../../terminal-setup/index.js'
import type { ActionContext } from './actions.js'
import type { SetupView } from '../../terminal-setup/index.js'
import type { WorkspaceController } from './controller.js'
const operations = new WeakMap<WorkspaceController, AbortController>()
export async function setupAction(
  id: string,
  ctx: Pick<ActionContext, 'controller' | 'get' | 'update'>
): Promise<boolean> {
  const { controller: c, get, update } = ctx
  const change = (p: Partial<SetupView>) =>
    update((s) => ({ ...s, setup: s.setup ? { ...s.setup, ...p } : null }))
  const focus = (value: string) =>
    update((s) => ({ ...s, focus: value, selected: 0, hover: '', overlay: null }))
  if (id === 'personal' || id === 'hosting' || id === 'install-models') {
    operations.get(c)?.abort()
    const mode =
      id === 'personal'
        ? 'personal'
        : id === 'hosting'
          ? 'server'
          : (await c.config()).values.tui.mode === 'personal'
            ? 'personal'
            : 'server'
    await c.save('tui.mode', mode)
    if (get().setupComplete && id !== 'install-models') {
      update((s) => ({
        ...s,
        page: mode === 'personal' ? 'chat' : 'server',
        focus: mode === 'personal' ? 'composer' : 'api-toggle',
      }))
      return true
    }
    update((s) => ({
      ...s,
      page: 'setup',
      setup: newSetup(mode),
      overlay: null,
      focus: 'setup-refresh',
      message: '',
    }))
    id = 'setup-refresh'
  }
  if (!id.startsWith('setup-')) return false
  const view = get().setup
  if (!view) return true
  if (id === 'setup-intro') {
    operations.get(c)?.abort()
    update((s) => ({ ...s, page: 'welcome', setup: null, focus: 'personal', overlay: null, message: '' }))
    return true
  }
  if (id.startsWith('setup-job:')) {
    update((s) => ({ ...s, selected: Number(id.slice(10)) }))
    return true
  }
  if (id === 'setup-engine-info') {
    update((s) => ({
      ...s,
      message:
        'MLX and Apple Intelligence require desktop-supplied runtimes; this terminal installer supports GGUF engines.',
    }))
    return true
  }
  if (['setup-cancel', 'setup-back', 'setup-engine-back'].includes(id)) {
    operations.get(c)?.abort()
    change({
      busy: false,
      preparing: false,
      error: '',
      stage: id === 'setup-engine-back' ? 'engine' : 'models',
      ...(id === 'setup-back' ? { repository: '', files: [] } : {}),
    })
    focus(
      id === 'setup-engine-back'
        ? 'setup-models'
        : view.files.length && id === 'setup-cancel'
          ? 'setup-file:0'
          : 'setup-repo:0'
    )
    return true
  }
  if (view.busy && !['setup-pause', 'setup-refresh'].includes(id)) return true
  operations.get(c)?.abort()
  const operation = new AbortController()
  operations.set(c, operation)
  const patch = (p: Partial<SetupView>) => {
    if (!operation.signal.aborted) change(p)
  }
  const wait = <T>(work: Promise<T>, ms = 45000) => setupWait(work, operation.signal, ms)
  patch({ busy: true, error: '' })
  try {
    if (id === 'setup-refresh') {
      await wait(c.initializeKeys())
      const catalogs = await wait(c.setup.catalogs(), 20000)
      const first = catalogs.find((cat) => cat.provider === 'llamacpp-upstream') ?? catalogs[0]!
      const build =
        first.available.find((b) => `${b.version}/${b.backend}` === first.recommended) ?? first.available[0]!
      patch({ catalogs, engine: view.engine || `${first.provider}|${build.version}|${build.backend}` })
      if (!operation.signal.aborted)
        focus(`setup-engine:${view.engine || `${first.provider}|${build.version}|${build.backend}`}`)
    } else if (id.startsWith('setup-engine:')) {
      patch({ engine: id.slice(13), busy: false })
      return setupAction('setup-models', ctx)
    } else if (['setup-models', 'setup-search', 'setup-catalog'].includes(id)) {
      const query = id === 'setup-catalog' ? '' : view.query
      patch({ stage: 'models', repository: '', files: [], query })
      const repositories = await wait(
        c.hub(query, operation.signal, (rows) => {
          if (!get().setup?.repository && get().setup?.query === query) patch({ repositories: rows })
        }),
        22000
      )
      patch({ repositories })
      if (!operation.signal.aborted) focus(repositories.length ? 'setup-repo:0' : 'setup-query')
    } else if (id === 'setup-query') {
      update((s) => ({
        ...s,
        overlay: 'endpoint',
        edit: 'setup-query',
        editValue: view.query,
        focus: 'save-edit',
      }))
    } else if (id.startsWith('setup-repo:') || id === 'setup-variants') {
      const index = id === 'setup-variants' ? get().selected : Number(id.slice(11))
      const repository = view.repositories[index]?.id
      if (repository) {
        const browse = id === 'setup-variants'
        patch({
          repository,
          files: [],
          selections: [],
          progress: null,
          error: '',
          stage: browse ? 'models' : 'download',
          preparing: !browse,
          pending: null,
          startedAt: Date.now(),
        })
        focus(browse ? 'setup-back' : 'setup-cancel')
        const files = await wait(c.files(repository, operation.signal), 22000)
        if (operation.signal.aborted) return true
        if (!files.length)
          throw new Error('No supported GGUF file is available for this model. Go back and choose another.')
        patch({ files, busy: false })
        if (browse) focus('setup-file:0')
        else return setupAction('setup-file:0', ctx)
      }
    } else if (id.startsWith('setup-file:') || (id === 'setup-retry' && view.pending && !view.progress)) {
      const file = view.files[Number(id.slice(11))]
      const pending =
        id === 'setup-retry'
          ? view.pending
          : file
            ? {
                repo: view.repository,
                file: file.filename,
                include_projector: true,
              }
            : null
      if (pending) {
        patch({
          stage: 'download',
          pending,
          preparing: true,
          progress: null,
          selections: [],
          startedAt: Date.now(),
        })
        focus('setup-cancel')
        const selection = await wait(c.setup.plan(pending))
        let engine = view.engine
        if (selection.plan.engine) {
          const e = selection.plan.engine
          engine = `${e.provider}|${e.version}|${e.backend}`
        } else if (engine.startsWith('atomic-prism|')) {
          throw new Error('This model needs llama.cpp or TurboQuant. Go back to Engines and choose one.')
        }
        if (operation.signal.aborted) return true
        patch({ selections: [selection], engine })
        // Preflight is cancellable; Core owns durable transfers from this point onward.
        patch({ preparing: false })
        focus('setup-pause')
        const progress = await wait(c.setup.begin(view.mode, engine, [selection]))
        patch({ progress, pending: null, startedAt: progress.manifest.startedAt })
      }
    } else if (id === 'setup-pause') {
      await wait(c.setup.pause())
      patch({ error: 'Downloads paused. Resume whenever you are ready.' })
    } else if (id === 'setup-retry' && view.preparing && !view.pending) {
      patch({ busy: false })
      return setupAction(`setup-repo:${view.repositories.findIndex((r) => r.id === view.repository)}`, ctx)
    } else if (id === 'setup-retry') {
      patch({ progress: await wait(c.setup.resume()) })
    } else if (id === 'setup-finish') {
      const manifest = await wait(c.setup.finish(), 180000)
      if (manifest.mode === 'personal') await wait(c.api(true, false))
      const model = manifest.selections[0]!.plan.model_id
      const endpoint = await c.localEndpoint()
      await c.save('tui.endpoint', endpoint)
      await c.save('tui.model', model)
      update((s) => ({
        ...s,
        setupComplete: true,
        setup: null,
        model,
        endpoint,
        page: manifest.mode === 'personal' ? 'chat' : 'server',
        focus: manifest.mode === 'personal' ? 'composer' : 'api-toggle',
        message: 'Everything is installed. Your workspace is ready.',
      }))
    }
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : 'Installation could not continue. Retry.' })
  } finally {
    patch({ busy: false })
  }
  return true
}
