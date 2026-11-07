/** The terminal's last catalog selection, independent of runtime and model selection. */
import { join } from 'node:path'
import { readDocument, writeDocument } from '../../../terminal-data/index.js'
import { CATALOG_FORMAT_LABELS } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { defaultFilters } from './catalog-filters.js'
import { CATEGORIES, record } from './library-model.js'

type Preferences = Pick<
  WorkspaceState,
  'libraryCategory' | 'libraryFormat' | 'libraryQuery' | 'catalogFilters'
>
export class CatalogPreferences {
  private readonly path: string
  private writing = Promise.resolve()
  constructor(directory: string) {
    this.path = join(directory, 'tui-catalog.json')
  }
  async read(): Promise<Partial<Preferences>> {
    const raw = record(await readDocument<unknown>(this.path, null))
    const filters = record(raw['catalogFilters'])
    const defaults = defaultFilters()
    return {
      libraryCategory: CATEGORIES.find((c) => c === raw['libraryCategory']) ?? 'text',
      libraryFormat: Object.hasOwn(CATALOG_FORMAT_LABELS, String(raw['libraryFormat']))
        ? (raw['libraryFormat'] as Preferences['libraryFormat'])
        : 'gguf',
      libraryQuery: typeof raw['libraryQuery'] === 'string' ? raw['libraryQuery'] : '',
      catalogFilters: {
        engine:
          typeof filters['engine'] === 'string' && !['audio-cpp', 'sd-cpp'].includes(filters['engine'])
            ? filters['engine']
            : '',
        sort: typeof filters['sort'] === 'string' ? filters['sort'] : defaults.sort,
        downloaded: filters['downloaded'] === true,
        uncensored: filters['uncensored'] === true,
        liked: filters['liked'] === true,
      },
    }
  }
  write(value: Preferences): Promise<void> {
    const next = this.writing.catch(() => {}).then(() => writeDocument(this.path, value))
    this.writing = next
    return next
  }
}
export async function saveCatalogPreferences(ctx: ActionContext) {
  const { libraryCategory, libraryFormat, libraryQuery, catalogFilters } = ctx.get()
  await ctx.controller.catalogPreferences?.write({
    libraryCategory,
    libraryFormat,
    libraryQuery,
    catalogFilters,
  })
}
