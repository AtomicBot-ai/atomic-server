import { foundryCatalogAction } from './catalog-foundry.js'
import { withInstalledRows } from './catalog-installed.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { catalogIndexes } from './catalog-filters.js'
import { catalogMenuAction } from './catalog-menu.js'
import { record } from './library-model.js'
import { bytes } from '../setup/setup-panel.js'
import { modelImportError } from '../../../workspace-view/index.js'
import { oneLine } from '../../controller.js'

/** Opening a catalog family reveals its versions; downloading remains a separate, direct action. */
export async function catalogBrowseAction(id: string, ctx: ActionContext) {
  if (await catalogMenuAction(id, ctx)) return true
  if (await foundryCatalogAction(id, ctx)) return true
  const s = ctx.get(),
    patch = (value: Partial<WorkspaceState>) => ctx.update((v) => ({ ...v, ...value }))
  if (id === 'catalog-import') {
    patch({ overlay: 'endpoint', edit: 'library-import', editValue: '', focus: 'save-edit', message: '' })
    return true
  }
  if (id === 'save-edit' && s.edit === 'library-import') {
    if (s.busy) return true
    patch({ busy: true, message: '' })
    try {
      await ctx.controller.runtime.execute('models.import', { path: s.editValue.trim() })
      const installed = await ctx.controller.installed()
      patch({
        installed,
        libraryRows: withInstalledRows(s.libraryRows, { ...s, installed }),
        overlay: null,
        edit: '',
        message: 'Model imported.',
      })
    } catch (error) {
      patch({ message: modelImportError(error, oneLine(error)) })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id.startsWith('catalog-like:')) {
    const row = s.libraryRows[Number(id.slice(13))]
    if (!row) return true
    const likes = s.catalogLikes.includes(row.id)
      ? s.catalogLikes.filter((item) => item !== row.id)
      : [...s.catalogLikes, row.id]
    await ctx.controller.saveCatalogLikes(likes)
    patch({ catalogLikes: likes })
    return true
  }
  if (!id.startsWith('catalog-row:')) return false
  const selected = Number(id.slice(12)),
    row = s.libraryRows[catalogIndexes(s)[selected] ?? -1]
  if (!row || s.busy) return true
  if (s.catalogOpen === row.id) {
    patch({ catalogOpen: '', selected })
    return true
  }
  patch({ catalogOpen: row.id, catalogVariants: [], catalogVariant: '', selected, busy: true })
  try {
    if (s.installed.some((item) => item.id === row.id)) return true
    const source = row.source ?? {},
      transformer = record(source['transformer'])
    const raw = source['variants'] ?? transformer['quants'] ?? source['quants']
    const variants =
      s.libraryCategory === 'text' &&
      !['mlx', 'safetensors', 'foundry'].includes(String(source['format'] ?? 'gguf'))
        ? (await ctx.controller.files(row.id)).map((file) => ({
            value: file.filename,
            label: `${file.filename} · ${bytes(file.size)}`,
          }))
        : Array.isArray(raw)
          ? raw.map(record).map((quant) => ({
              value: String(quant['id']),
              label: `${quant['id']}${quant['bytes'] || quant['size_bytes'] ? ' · ' + bytes(Number(quant['bytes'] ?? quant['size_bytes'])) : ''}`,
            }))
          : []
    // A response from an older row must not replace the currently open family.
    if (ctx.get().catalogOpen === row.id)
      patch({
        catalogVariants: variants,
        catalogVariant: String(source['default_variant'] ?? variants[0]?.value ?? ''),
      })
  } catch (error) {
    patch({ message: error instanceof Error ? error.message : String(error) })
  } finally {
    patch({ busy: false })
  }
  return true
}
