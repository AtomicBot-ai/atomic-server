import { engineAction, engineRunner, hasPanel } from './engine-actions.js'
import { catalogAction, jobRunner, libraryFormats, managedChoice } from './catalog-actions.js'
import { downloadRows } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { LibraryView } from './library-model.js'
import { libraryRows, record } from './library-model.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
export async function libraryAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (await catalogAction(id, ctx)) return true
  const { get, update, controller: c } = ctx,
    s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  if (id === 'page:models') {
    patch({
      page: 'models',
      setup: null,
      libraryView: 'installed',
      selected: 0,
      overlay: null,
      focus: 'library:catalog',
      message: '',
    })
    const [installed, models] = await Promise.all([c.installed(), c.models(s.endpoint).catch(() => s.models)])
    patch({ installed, models })
    return true
  }
  if (id.startsWith('library:') || id.startsWith('category:') || id === 'library-refresh') {
    const view = id.startsWith('library:') ? (id.slice(8) as LibraryView) : s.libraryView
    const category = id.startsWith('category:') ? id.slice(9) : s.libraryCategory
    patch({
      page: 'models',
      overlay: null,
      edit: '',
      libraryView: view,
      libraryCategory: category,
      ...(id === 'library-refresh' ? {} : { libraryFormat: 'gguf' as const }),
      selected: 0,
      focus: 'library-row:0',
      hover: '',
      message: '',
    })
    if (view === 'installed') {
      patch({ installed: await c.installed() })
      return true
    }
    if (view === 'downloads') {
      patch({ workspace: await c.runtime.snapshot() })
      return true
    }
    patch({ busy: true, libraryRows: [] })
    if (view === 'catalog' && !s.libraryEngines.length)
      patch({
        libraryEngines: await Promise.resolve()
          .then(() => c.setup.engines())
          .catch(() => []),
      })
    try {
      const result = await c.runtime.execute(
        view === 'engines' ? 'engines.list' : 'models.catalog',
        view === 'engines'
          ? { force: id === 'library-refresh' }
          : { category, query: s.libraryQuery, refresh: id === 'library-refresh' }
      )
      patch({ libraryRows: libraryRows(result, view), message: String(record(result)['error'] ?? '') })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'library-search') {
    patch({ overlay: 'endpoint', edit: 'library-query', editValue: s.libraryQuery, focus: 'save-edit' })
    return true
  }
  if (id === 'save-edit' && s.edit === 'library-query') {
    patch({ libraryQuery: s.editValue, overlay: null, libraryView: 'catalog' })
    return libraryAction('library-refresh', ctx)
  }
  if (id.startsWith('library-row:')) {
    const index = Number(id.slice(12)),
      row = s.libraryRows[index]
    if (!row || s.busy) return true
    if (s.libraryView === 'engines' && hasPanel(row.id)) return engineAction(`engine-open:${row.id}`, ctx)
    if (s.libraryView === 'engines') return (patch(engineRunner(row.id, row.source)), true)
    patch({ busy: true, message: 'Checking installation requirements…', selected: index })
    try {
      let request: Record<string, unknown>
      if (s.libraryCategory === 'text' && row.source?.['format'] === 'safetensors')
        return await managedChoice(row.id, ctx)
      if (s.libraryCategory === 'text' && row.source?.['format'] !== 'mlx') {
        const files = await c.files(row.id),
          file = files[0] // modelFiles puts the default quant first
        // A repository without GGUF may be a managed engine's: the core's verdicts lead there.
        if (!file && libraryFormats(s.libraryEngines).includes('safetensors'))
          return await managedChoice(row.id, ctx)
        if (!file) throw new Error('No GGUF file found. Use engine-specific controls for this model format.')
        request = { repo: row.id, file: file.filename, include_projector: true }
      } else request = { category: s.libraryCategory, model_id: row.id }
      const plan = record(
        await c.runtime.execute('category' in request ? 'artifacts.plan' : 'models.plan', request)
      )
      patch({
        libraryPlan: plan,
        libraryRequest: request,
        overlay: 'install-review',
        focus: 'library-install',
        message: '',
      })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'library-install') {
    if (!s.libraryPlan || s.busy) return true
    const media = 'category' in s.libraryRequest
    patch({ busy: true, message: 'Starting download…' })
    try {
      await c.runtime.execute(media ? 'artifacts.install' : 'models.install', {
        ...(media ? {} : { request: s.libraryRequest }),
        plan_digest: s.libraryPlan['plan_digest'] ?? s.libraryPlan['digest'],
        request_id: `terminal-${Date.now()}`,
      })
      patch({
        libraryView: 'downloads',
        overlay: null,
        message: '',
        workspace: await c.runtime.snapshot(),
        focus: 'library:downloads',
      })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id.startsWith('media-installed:')) {
    patch({ busy: true, message: 'Loading media model…' })
    try {
      await c.runtime.execute('artifacts.load', { id: id.slice(16) })
      patch({ workspace: await c.runtime.snapshot(), message: 'Model loaded.' })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id.startsWith('download-row:')) {
    const job = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? [])[Number(id.slice(13))]
    if (!job) return true
    const runner = jobRunner(job)
    if (runner) return (patch(runner), true)
    const media = job.owner === 'artifacts',
      standalone = job.owner === 'download'
    const name = standalone ? '' : media ? 'artifacts.resume' : 'setup.resume'
    patch({
      operations: [...WORKSPACE_OPERATIONS],
      toolGroup: standalone ? 'download' : media ? 'artifacts' : 'setup',
      operation: name,
      operationInput: JSON.stringify(standalone ? {} : media ? { id: job.id } : { setup_id: job.id }),
      operationResult: JSON.stringify(job, null, 2),
      page: 'tools',
      operationReturn: 'models',
      edit: 'operation-output',
      focus: standalone ? 'operation-copy' : 'operation-select',
      selected: 0,
      scroll: 0,
    })
    return true
  }
  if ((id === 'scroll-up' || id === 'scroll-down') && s.page === 'models' && !s.setup) {
    const length =
      s.libraryView === 'downloads'
        ? downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).length
        : s.libraryView === 'installed'
          ? s.installed.length + s.models.length
          : s.libraryRows.length
    patch({
      selected: Math.max(0, Math.min(length - 1, s.selected + (id === 'scroll-up' ? -3 : 3))),
      hover: '',
    })
    return true
  }
  return false
}
