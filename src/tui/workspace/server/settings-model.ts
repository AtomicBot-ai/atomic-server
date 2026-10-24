import { SERVER_SETTINGS_GROUPS } from '../../../contract/index.js'
import type { ConfigRow } from '../../state.js'
import type { WorkspaceState } from '../state.js'

export type SettingsEntry =
  | { id: string; kind: 'about'; version: string }
  | { id: string; kind: 'field'; row: ConfigRow }
  | { id: string; kind: 'group'; label: string; expanded: boolean }
  | { id: string; kind: 'link'; label: string }

export function settingsEntries(s: WorkspaceState): SettingsEntry[] {
  const fields = (group: string): SettingsEntry[] =>
    s.base.config.rows
      .filter((r) => r.path.startsWith(`${group}.`) && r.path !== 'tui.mode')
      .map((row) => ({ id: `setting:${row.path}`, kind: 'field', row }))
  if (s.settingsGroup !== 'admin') return fields(s.settingsGroup)
  const admin = fields('admin'),
    advancedPaths = ['setting:admin.host', 'setting:admin.port'],
    expanded = s.settingsExpanded.includes('admin-advanced')
  return [
    { id: 'settings-about', kind: 'about', version: s.workspace?.core.version ?? 'Not reported' },
    ...admin.filter((entry) => !advancedPaths.includes(entry.id)),
    { id: 'settings-expand:admin-advanced', kind: 'group', label: 'Advanced settings', expanded },
    ...(expanded ? admin.filter((entry) => advancedPaths.includes(entry.id)) : []),
    ...SERVER_SETTINGS_GROUPS.flatMap((group): SettingsEntry[] => {
      const expanded = s.settingsExpanded.includes(group.id)
      const links =
        group.id === 'diagnostics'
          ? [
              { id: 'page:logs', label: 'Server logs' },
              { id: 'page:checks', label: 'System checks' },
              { id: 'page:commands', label: 'Command reference' },
            ]
          : group.id === 'engines'
            ? [{ id: 'library:engines', label: 'Inference engines' }]
            : group.id === 'managed'
              ? [{ id: 'open-operation:environments.list', label: 'Environments' }]
              : []
      return [
        { id: `settings-expand:${group.id}`, kind: 'group', label: group.label, expanded },
        ...(expanded ? fields(group.id) : []),
        ...(expanded ? links.map((link) => ({ ...link, kind: 'link' as const })) : []),
      ]
    }),
  ]
}

export function settingRows(s: WorkspaceState) {
  return settingsEntries(s).flatMap((entry) => (entry.kind === 'field' ? [entry.row] : []))
}

export function moveSettings(s: WorkspaceState, delta: number) {
  const all = settingsEntries(s),
    entries = all.filter((entry) => entry.kind !== 'about')
  const at = entries.findIndex((entry) => entry.id === s.focus)
  const selected = Math.max(0, Math.min(entries.length - 1, (at >= 0 ? at : s.selected) + delta))
  return {
    selected: all.indexOf(entries[selected]!),
    focus: entries[selected]?.id ?? 'section-menu',
    hover: '',
  }
}
