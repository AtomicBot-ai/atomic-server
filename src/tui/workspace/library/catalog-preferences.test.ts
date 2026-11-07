import { expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { writeDocument } from '../../../terminal-data/index.js'
import { tmpDataFolder } from '../../../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../../../config/index.js'
import type { WorkspaceController } from '../controller.js'
import { startup } from '../startup.js'
import { defaultFilters } from './catalog-filters.js'
import { CatalogPreferences } from './catalog-preferences.js'

it('restores the last catalog choice through startup after a new controller is created', async () => {
  const f = tmpDataFolder()
  try {
    const directory = dirname(f.paths.configFile)
    const store = new CatalogPreferences(directory)
    const choice = {
      libraryCategory: 'audio',
      libraryFormat: 'fastflowlm' as const,
      libraryQuery: 'qwen',
      catalogFilters: { ...defaultFilters(), engine: 'fastflowlm', liked: true, sort: 'downloads' },
    }
    await Promise.all([store.write({ ...choice, libraryFormat: 'mlx' }), store.write(choice)])
    const c = {
      catalogPreferences: new CatalogPreferences(directory),
      config: async () => ({ values: defaultConfig() }),
      localEndpoint: async () => 'http://localhost:1337/v1',
      history: { list: async () => [] },
      engineSelection: { read: async () => 'fastflowlm' },
      setup: { read: async () => ({ complete: true }) },
    } as unknown as WorkspaceController
    expect(await startup(c, 'models')).toMatchObject(choice)
  } finally {
    f.cleanup()
  }
})
it('defaults a missing preference and ignores invalid saved fields', async () => {
  const f = tmpDataFolder()
  try {
    const directory = dirname(f.paths.configFile),
      store = new CatalogPreferences(directory)
    expect(await store.read()).toMatchObject({
      libraryFormat: 'gguf',
      libraryCategory: 'text',
      catalogFilters: defaultFilters(),
    })
    await writeDocument(join(directory, 'tui-catalog.json'), {
      libraryCategory: 'wrong',
      libraryFormat: 'wrong',
      libraryQuery: 3,
      catalogFilters: { engine: 'audio-cpp', liked: 'yes', sort: false },
    })
    expect(await store.read()).toMatchObject({
      libraryFormat: 'gguf',
      libraryCategory: 'text',
      libraryQuery: '',
      catalogFilters: defaultFilters(),
    })
  } finally {
    f.cleanup()
  }
})
