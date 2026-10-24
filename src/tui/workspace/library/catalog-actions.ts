/**
 * The TUI Library for managed engines and Foundry Local (spec managed-models-server, foundry-local-server):
 * the text catalog's format filter, a repository without GGUF led to the managed engine that takes it
 * (its plan when that engine is installed, its panel to install it otherwise) instead of "No GGUF file",
 * removal of an installed model (a store model goes for every managed engine), and Downloads rows of
 * the server's store and Foundry Local jobs opened on Cancel or Resume.
 */

import { withInstalledRows } from './catalog-installed.js'
import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import type { ManagedVerdict } from '../../../contract/index.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import { verdictLine } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { engineAction } from './engine-actions.js'
import { loadFoundryCatalog } from './catalog-foundry.js'
import { libraryRows, record } from './library-model.js'

export type LibraryFormat = 'mlx' | 'gguf' | 'safetensors' | 'foundry'
const managed = (engines: readonly string[]) =>
  engines.filter((e) => ENGINE_KINDS[e as EngineId] === 'managed')
const ACTIVE = ['queued', 'downloading', 'verifying']

/** Formats the text catalog offers on this host: GGUF, plus what the core's engines here run. */
export function libraryFormats(engines: readonly string[]): LibraryFormat[] {
  return [
    'gguf',
    ...(engines.includes('mlx') ? (['mlx'] as const) : []),
    ...(managed(engines).length ? (['safetensors'] as const) : []),
    ...(engines.includes('foundry-local') ? (['foundry'] as const) : []),
  ]
}

/** The core's verdicts on `repository`: its plan on an installed engine that takes it, else that engine's panel. */
export async function managedChoice(repository: string, ctx: ActionContext): Promise<boolean> {
  const { controller: c, update } = ctx
  const { verdicts } = (await c.runtime.execute('models.check', { repository })) as {
    verdicts: ManagedVerdict[]
  }
  const takes = verdicts.filter((v) => v.compatibility?.verdict.ok)
  const installed = takes.find((v) => v.installed)
  if (installed) {
    const plan = record(await c.runtime.execute('managed.plan', { repository, engine: installed.engine }))
    update((v) => ({
      ...v,
      libraryPlan: plan,
      libraryRequest: { managed: installed.engine, repository, verdicts },
      overlay: 'install-review',
      focus: 'library-install',
      message: '',
    }))
    if (!Array.isArray(plan['blockers']) || !plan['blockers'].length)
      return catalogAction('library-install', ctx)
    return true
  }
  if (takes[0]) {
    await engineAction(`engine-open:${takes[0].engine}`, ctx)
    update((v) =>
      v.enginePanel
        ? {
            ...v,
            enginePanel: {
              ...v.enginePanel,
              notice: `${repository} runs on ${takes[0]!.engine} once it is installed.`,
            },
          }
        : v
    )
    return true
  }
  throw new Error(
    verdicts.length
      ? verdicts.map(verdictLine).join(' ')
      : 'No GGUF file found, and no managed engine takes this model.'
  )
}

async function catalogRows(
  ctx: ActionContext,
  format: LibraryFormat
): Promise<WorkspaceState['libraryRows']> {
  const s = ctx.get()
  if (format === 'foundry') return loadFoundryCatalog(ctx)
  const engine =
    managed(s.libraryEngines).find((e) => e === s.catalogFilters.engine) ?? managed(s.libraryEngines)[0]
  if (format !== 'safetensors' || !engine)
    return libraryRows(
      await ctx.controller.runtime.execute('models.catalog', { category: s.libraryCategory }),
      'catalog'
    )
  const query = s.libraryQuery
  const result = record(
    await ctx.controller.runtime.execute(query ? 'models.search' : 'models.catalog', {
      engine,
      ...(query ? { query } : {}),
    })
  )
  const rows = (
    Array.isArray(result['models']) ? result['models'] : Array.isArray(result['rows']) ? result['rows'] : []
  ).map(record)
  return rows.map((r) => ({
    id: String(r['repository']),
    name: String(r['repository']),
    category: 'text',
    description: String(r['note'] ?? r['section'] ?? 'safetensors'),
    source: { format: 'safetensors', engine },
  }))
}

export async function catalogAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, update, controller: c } = ctx
  const s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  if (id.startsWith('format:')) {
    const format = id.slice('format:'.length) as LibraryFormat
    patch({ libraryFormat: format, busy: true, selected: 0 })
    try {
      patch({ libraryRows: withInstalledRows(await catalogRows(ctx, format), get()) })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if ((id === 'library-remove' && s.libraryView === 'installed') || id.startsWith('installed-delete:')) {
    const model = id.startsWith('installed-delete:')
      ? s.installed.find((m) => m.id === decodeURIComponent(id.slice(17)))
      : s.installed[s.selected]
    if (model) patch({ overlay: 'remove-model', libraryRemove: model.id, focus: 'close' })
    return true
  }
  if (id === 'remove-model-confirm' && s.libraryRemove) {
    patch({ overlay: null, busy: true, message: `Removing ${s.libraryRemove}…` })
    try {
      await c.runtime.execute('models.remove', { model_id: s.libraryRemove })
      patch({
        installed: await c.installed(),
        libraryRows: s.libraryRows.filter((row) => row.id !== s.libraryRemove || !row.source?.['installed']),
        message: `Removed ${s.libraryRemove}.`,
        libraryRemove: '',
      })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'library-install' && s.libraryRequest['managed'] && s.libraryPlan) {
    patch({ busy: true, message: 'Starting download…' })
    try {
      await c.runtime.execute('managed.install', {
        request_id: `terminal-${randomUUID()}`,
        plan_digest: s.libraryPlan['digest'],
      })
      patch({
        libraryView: s.catalogOpen ? 'catalog' : 'downloads',
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
  return false
}

/** A Downloads row of a store or Foundry Local job: the operation runner on Cancel while it runs, else Resume. */
export function jobRunner(job: Record<string, unknown>): Partial<WorkspaceState> | null {
  const kind = job['kind']
  if (kind !== 'managed-model' && kind !== 'foundry-model') return null
  const prefix = kind === 'managed-model' ? 'managed' : 'foundry'
  const running = ACTIVE.includes(String(job['stage']))
  return {
    operations: [...WORKSPACE_OPERATIONS],
    toolGroup: prefix,
    operation: running ? `${prefix}.cancel` : `${prefix}.install`,
    operationInput: JSON.stringify(
      running ? { id: job['id'] } : { request_id: job['id'], plan_digest: record(job['plan'])['digest'] }
    ),
    operationResult: JSON.stringify(job, null, 2),
    page: 'tools',
    operationReturn: 'models',
    edit: 'operation-output',
    focus: 'operation-select',
    selected: 0,
    scroll: 0,
  }
}
