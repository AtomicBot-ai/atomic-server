import type { Key } from 'ink'
import type { WorkspaceState } from './state.js'
import { catalogIndexes } from './library/catalog-filters.js'
import { cloudChoices } from './library/cloud-catalog.js'
import { installedModelRows } from './library/installed-model-rows.js'
import { downloadRows } from '../../workspace-view/index.js'
export function listInput(key: Key, s: WorkspaceState) {
  if (
    s.page === 'models' &&
    s.libraryView === 'installed' &&
    (s.focus.startsWith('installed:') || s.focus.startsWith('media-installed:')) &&
    (key.upArrow || key.downArrow)
  ) {
    const rows = installedModelRows(s)
    const at = rows.findIndex((row) => row.id === s.focus)
    const selected = Math.max(0, Math.min(rows.length - 1, at + (key.upArrow ? -1 : 1)))
    return { patch: { selected, focus: rows[selected]?.id ?? '', hover: '' } }
  }
  const listPrefixes = [
    'model:',
    'installed:',
    'first-installed:',
    'request:',
    'command:',
    'setup-repo:',
    'setup-file:',
    'setup-job:',
    'library-row:',
    'catalog-row:',
    'cloud-choice:',
    'media-row:',
    'media-queue:',
    'download-row:',
  ]
  const prefix = listPrefixes.find((p) => s.focus.startsWith(p))
  if ((key.upArrow || key.downArrow) && prefix) {
    const length =
      prefix === 'media-queue:'
        ? 2
        : prefix === 'catalog-row:'
          ? catalogIndexes(s).length
          : prefix === 'cloud-choice:'
            ? cloudChoices(s.cloud).length
            : prefix === 'media-row:'
              ? s.libraryRows.length
              : prefix === 'download-row:'
                ? downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).length
                : prefix === 'library-row:'
                  ? s.libraryRows.length
                  : prefix === 'model:'
                    ? s.models.length
                    : prefix === 'installed:' || prefix === 'first-installed:'
                      ? s.installed.length
                      : prefix === 'request:'
                        ? s.requests.length
                        : prefix === 'command:'
                          ? s.commands.length
                          : prefix === 'setup-repo:'
                            ? (s.setup?.repositories.length ?? 0)
                            : prefix === 'setup-job:'
                              ? (s.setup?.selections.length ?? 0)
                              : (s.setup?.files.length ?? 0)
    const selected = Math.max(
      0,
      Math.min(length - 1, Number(s.focus.slice(prefix.length)) + (key.upArrow ? -1 : 1))
    )
    return { patch: { selected, focus: `${prefix}${selected}`, hover: '' } }
  }
  return null
}
