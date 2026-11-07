/**
 * The TUI Library for managed engines, Foundry Local and LiteRT-LM (specs managed-models-server,
 * foundry-local-server, litert-lm-server): the text catalog's format filter, a repository without GGUF
 * led to the managed engine that takes it (its plan when that engine is installed, its panel to install
 * it otherwise) instead of "No GGUF file",
 * removal of an installed model (a store model goes for every managed engine), and Downloads rows of
 * the server's store, Foundry Local and LiteRT-LM jobs opened on Cancel or Resume.
 */

import { readCatalog } from './catalog-read.js'
import { randomUUID } from 'node:crypto'
import type { ManagedVerdict } from '../../../contract/index.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import { catalogFormatsFor, verdictLine } from '../../../workspace-view/index.js'
import type { CatalogFormat } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { engineAction } from './engine-actions.js'
import { record } from './library-model.js'

export type LibraryFormat = CatalogFormat
const ACTIVE = ['queued', 'downloading', 'verifying']

/** Formats the text catalog offers on this host: GGUF, plus what the core's engines here run. */
export const libraryFormats = (engines: readonly string[]): LibraryFormat[] => catalogFormatsFor(engines)

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
  update((v) => ({
    ...v,
    busy: false,
    message: verdicts.length
      ? verdicts.map(verdictLine).join(' ')
      : 'No GGUF file found, and no managed engine takes this model.',
  }))
  return true
}

export async function catalogAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, update, controller: c } = ctx
  const s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  if (id.startsWith('format:')) {
    const format = id.slice('format:'.length) as LibraryFormat
    patch({ libraryFormat: format, libraryCategory: 'text' })
    await readCatalog(ctx)
    return true
  }
  if (
    (id === 'library-remove' && s.libraryView === 'installed') ||
    id.startsWith('fastflowlm-delete:') ||
    id.startsWith('geniex-delete:') ||
    id.startsWith('installed-delete:')
  ) {
    const model = id.startsWith('fastflowlm-delete:')
      ? s.installed.find(
          (m) =>
            m.store === 'fastflowlm' && m.id === decodeURIComponent(id.slice('fastflowlm-delete:'.length))
        )
      : id.startsWith('geniex-delete:')
        ? s.installed.find(
            (m) => m.store === 'geniex' && m.id === decodeURIComponent(id.slice('geniex-delete:'.length))
          )
        : id.startsWith('installed-delete:')
          ? s.installed.find((m) => m.id === decodeURIComponent(id.slice(17)))
          : s.installed[s.selected]
    if (model)
      patch({
        overlay: 'remove-model',
        libraryRemove: model.id,
        removeModelStore: model.store === 'geniex' || model.store === 'fastflowlm' ? model.store : undefined,
        focus: 'close',
      })
    return true
  }
  if (id === 'remove-model-confirm' && s.libraryRemove) {
    patch({ overlay: null, busy: true, message: `Removing ${s.libraryRemove}…` })
    try {
      await c.runtime.execute('models.remove', {
        model_id: s.libraryRemove,
        ...(s.removeModelStore ? { store: s.removeModelStore } : {}),
      })
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

const JOB_TOOLS: Readonly<Record<string, string>> = {
  'managed-model': 'managed',
  'foundry-model': 'foundry',
  'geniex-model': 'geniex',
  'fastflowlm-model': 'fastflowlm',
  'litert-model': 'litert',
}

/** A Downloads row of a store, Foundry Local or LiteRT-LM job: the operation runner on Cancel while it runs, else Resume. */
export function jobRunner(job: Record<string, unknown>): Partial<WorkspaceState> | null {
  const prefix = JOB_TOOLS[String(job['kind'])]
  if (!prefix) return null
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
