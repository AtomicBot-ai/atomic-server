import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SECTIONS,
  LIBRARY_SECTIONS,
  SERVER_NAVIGATION,
  SETTINGS_SECTIONS,
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

  it('gives the account its own sections, as the desktop app does, and keeps it out of Settings', () => {
    expect(ACCOUNT_SECTIONS.map((s) => s.label)).toEqual(['Overview', 'Remote models'])
    expect(SETTINGS_SECTIONS.some((s) => (s.id as string) === 'account')).toBe(false)
  })
})
