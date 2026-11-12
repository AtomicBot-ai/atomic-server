import { describe, expect, it } from 'vitest'
import {
  LIBRARY_SECTIONS,
  SERVER_NAVIGATION,
  SETTING_LABELS,
  WORKSPACE_NAVIGATION,
} from './workspace-navigation.js'

describe('workspace navigation', () => {
  it('lists the pages in the order the rails show them, so Alt+1…4 follow the menu', () => {
    expect(WORKSPACE_NAVIGATION.map((p) => p.id)).toEqual(['server', 'playground', 'catalog', 'settings'])
  })

  it('names sections by what they are: the catalog, remote providers, the download proxy', () => {
    expect(LIBRARY_SECTIONS.find((s) => s.id === 'catalog')?.label).toBe('Catalog')
    expect(LIBRARY_SECTIONS.find((s) => s.id === 'cloud')?.label).toBe('Remote providers')
    expect(SERVER_NAVIGATION.find((s) => s.id === 'proxy')?.label).toBe('Download proxy')
  })

  it('no longer labels the config fields the 6 → 7 migration removes', () => {
    for (const path of [
      'admin.openOnStart',
      'engines.autoInstall',
      'managed.mode',
      'managed.image',
      'update.channel',
    ])
      expect(SETTING_LABELS[path]).toBeUndefined()
  })
})
