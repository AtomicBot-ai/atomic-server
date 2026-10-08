import { newSetup } from '../../terminal-setup/index.js'
import type { ActionContext } from './actions.js'
import type { SetupView } from '../../terminal-setup/index.js'
export async function setupAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { controller: c, get, update } = ctx
  const patch = (p: Partial<SetupView>) =>
    update((s) => ({ ...s, setup: s.setup ? { ...s.setup, ...p } : null }))
  if (id === 'personal' || id === 'hosting' || id === 'install-models') {
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
  if (id.startsWith('setup-job:')) {
    update((s) => ({ ...s, selected: Number(id.slice(10)) }))
    return true
  }
  const view = get().setup
  if (!view || view.busy) return true
  patch({ busy: true, error: '' })
  try {
    if (id === 'setup-refresh') {
      await c.initializeKeys()
      const catalogs = await c.setup.catalogs()
      const first = catalogs.find((cat) => cat.provider === 'llamacpp-upstream') ?? catalogs[0]!
      const build =
        first.available.find((b) => `${b.version}/${b.backend}` === first.recommended) ?? first.available[0]!
      patch({ catalogs, engine: view.engine || `${first.provider}|${build.version}|${build.backend}` })
      update((s) => ({ ...s, focus: 'setup-models' }))
    } else if (id.startsWith('setup-engine:')) {
      patch({ engine: id.slice(13) })
    } else if (id === 'setup-models' || id === 'setup-search') {
      patch({ stage: 'models', repository: '', files: [], repositories: await c.hub(view.query) })
      update((s) => ({ ...s, selected: 0, focus: 'setup-query', overlay: null }))
    } else if (id === 'setup-query') {
      update((s) => ({
        ...s,
        overlay: 'endpoint',
        edit: 'setup-query',
        editValue: view.query,
        focus: 'save-edit',
      }))
    } else if (id.startsWith('setup-repo:')) {
      const repository = view.repositories[Number(id.slice(11))]?.id
      if (repository) {
        patch({ repository, files: await c.files(repository) })
        update((s) => ({ ...s, selected: 0, focus: 'setup-file:0' }))
      }
    } else if (id.startsWith('setup-file:')) {
      const file = view.files[Number(id.slice(11))]
      if (file) {
        const existing = view.selections.find(
          (p) => p.request.repo === view.repository && p.request.file === file.filename
        )
        if (existing) patch({ selections: view.selections.filter((p) => p !== existing) })
        else {
          if (view.selections.length >= 4)
            throw new Error('Select up to four models for this installation. You can add more later.')
          const selection = await c.setup.plan({
            repo: view.repository,
            file: file.filename,
            include_projector: true,
          })
          if (
            selection.plan.provider === 'llamacpp-upstream' &&
            !view.engine.startsWith('llamacpp-upstream|')
          )
            throw new Error('This GGUF uses llama.cpp. Choose the llama.cpp engine on the previous step.')
          patch({ selections: [...view.selections, selection] })
        }
      }
    } else if (id === 'setup-review') {
      if (!view.selections.length) throw new Error('Choose at least one model to continue.')
      patch({ stage: 'review' })
      update((s) => ({ ...s, focus: 'setup-begin', selected: 0 }))
    } else if (id === 'setup-engine-back') patch({ stage: 'engine' })
    else if (id === 'setup-back') patch({ stage: 'models', repository: '', files: [] })
    else if (id === 'setup-begin') {
      patch({ stage: 'download', startedAt: Date.now() })
      update((s) => ({ ...s, focus: 'setup-retry', selected: 0 }))
      const progress = await c.setup.begin(view.mode, view.engine, view.selections)
      patch({ progress, startedAt: progress.manifest.startedAt })
    } else if (id === 'setup-pause') {
      await c.setup.pause()
      patch({ error: 'Downloads paused. Resume whenever you are ready.' })
    } else if (id === 'setup-retry') patch({ progress: await c.setup.resume() })
    else if (id === 'setup-finish') {
      const manifest = await c.setup.finish()
      if (manifest.mode === 'personal') await c.api(true, false)
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
