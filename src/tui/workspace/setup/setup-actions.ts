import { newSetup, setupWait } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { SetupView } from '../../../terminal-setup/index.js'
import type { WorkspaceController } from '../controller.js'
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
  if (id === 'library-close') {
    operations.get(c)?.abort()
    update((s) => ({ ...s, page: 'models', setup: null, overlay: null, focus: 'install-models', hover: '' }))
    return true
  }
  if (id === 'personal' || id === 'hosting' || id === 'install-models') {
    operations.get(c)?.abort()
    const mode =
      id === 'personal'
        ? 'personal'
        : id === 'hosting'
          ? 'server'
          : (await c.config()).values.tui.mode === 'server'
            ? 'server'
            : 'personal'
    await c.save('tui.mode', mode)
    if (get().setupComplete && id !== 'install-models') {
      update((s) => ({
        ...s,
        page: mode === 'personal' ? 'chat' : 'server',
        focus: mode === 'personal' ? 'composer' : 'api-toggle',
        overlay: null,
        hover: '',
      }))
      return true
    }
    update((s) => ({
      ...s,
      page: s.setupComplete ? 'models' : 'setup',
      setup: { ...newSetup(mode), engine: s.engine },
      overlay: null,
      focus: 'setup-refresh',
      message: '',
    }))
    id = 'setup-refresh'
    if (get().setupComplete) {
      const manifest = await c.setup.read()
      if (manifest && !manifest.complete) {
        change({
          stage: 'download',
          startedAt: manifest.startedAt,
          selections: manifest.selections,
          engine: `${manifest.engine.provider}|${manifest.engine.version}|${manifest.engine.backend}`,
        })
        focus('setup-retry')
        return true
      }
    }
  }
  if (!id.startsWith('setup-')) return false
  const view = get().setup
  if (!view) return true
  if (id === 'setup-intro') {
    if (get().setupComplete) return setupAction('library-close', ctx)
    operations.get(c)?.abort()
    update((s) => ({ ...s, page: 'welcome', setup: null, focus: 'personal', overlay: null, message: '' }))
    return true
  }
  if (id.startsWith('setup-job:')) {
    update((s) => ({ ...s, selected: Number(id.slice(10)) }))
    return true
  }
  if (id === 'setup-engine-info') {
    await c.runtime.execute('setup.manual')
    update((s) => ({
      ...s,
      setupComplete: true,
      setup: null,
      page: 'models',
      libraryView: 'installed',
      focus: 'library:catalog',
      message: 'Choose Catalog for all workloads or Engines to install a runtime.',
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
        if (selection.plan.provider === 'atomic-prism' && !engine.startsWith('atomic-prism|'))
          throw new Error('This model requires Atomic Prism. Go back to Engines and choose it explicitly.')
        if (selection.plan.engine) {
          const e = selection.plan.engine
          engine = `${e.provider}|${e.version}|${e.backend}`
        } else if (engine.startsWith('atomic-prism|')) {
          throw new Error('This model needs llama.cpp or TurboQuant. Go back to Engines and choose one.')
        }
        if (operation.signal.aborted) return true
        patch({ selections: [selection], engine, preparing: false, stage: 'review' })
        focus('setup-install')
      }
    } else if (id === 'setup-install' && view.stage === 'review' && view.selections.length) {
      const plan = view.selections[0]!.plan as unknown as Record<string, unknown>
      if (Array.isArray(plan['blockers']) && plan['blockers'].length)
        throw new Error('Resolve the compatibility blockers before downloading.')
      const progress = await wait(c.setup.begin(view.mode, view.engine, view.selections))
      patch({ stage: 'download', progress, pending: null, startedAt: progress.manifest.startedAt })
      focus('setup-pause')
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
      const engine = manifest.engine
      const engineId = `${engine.provider}|${engine.version}|${engine.backend}`
      await c.engineSelection.remember(engineId)
      await wait(c.api(true, false))
      const model = manifest.selections[0]!.plan.model_id
      await wait(c.runtime.execute('setup.complete', { model_id: model }))
      const endpoint = await c.localEndpoint()
      await c.save('tui.endpoint', endpoint)
      await c.save('tui.model', model)
      const current = get()
      const page =
        current.setupComplete && !['models', 'setup'].includes(current.page)
          ? current.page
          : manifest.mode === 'personal'
            ? 'chat'
            : 'server'
      update((s) => ({
        ...s,
        setupComplete: true,
        setup: null,
        model,
        engine: engineId,
        endpoint,
        page,
        focus:
          page === current.page && current.setupComplete
            ? s.focus
            : page === 'chat'
              ? 'composer'
              : 'api-toggle',
        message: 'Model loaded. API ready.',
      }))
    }
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : 'Installation could not continue. Retry.' })
  } finally {
    patch({ busy: false })
  }
  return true
}
