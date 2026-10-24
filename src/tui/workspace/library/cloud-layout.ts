/** Match the desktop provider grid, reducing columns without hiding list navigation. */
export function cloudListLayout(width: number, available: number) {
  const columns = width >= 92 ? 4 : width >= 62 ? 3 : width >= 40 ? 2 : 1
  return {
    columns,
    rows: Math.max(1, Math.floor(available / 3)),
    cardWidth: Math.floor((width - columns) / columns),
  }
}

import type { Key } from 'ink'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { shellLayout } from '../shell-layout.js'
import { cloudChoices } from './cloud-catalog.js'

export function cloudGridInput(key: Key, s: WorkspaceState, frame: Canvas) {
  if (
    !s.focus.startsWith('cloud-choice:') ||
    !(key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.pageUp || key.pageDown)
  )
    return null
  const width =
    s.overlay === 'cloud'
      ? Math.min(84, frame.width - 8) - 2
      : s.page === 'welcome'
        ? Math.min(100, frame.width - 8)
        : shellLayout(frame.width, frame.height).width
  const { columns } = cloudListLayout(width, frame.height)
  const page = Math.max(columns, frame.targets.filter((t) => t.id.startsWith('cloud-choice:')).length)
  const delta = key.pageUp
    ? -page
    : key.pageDown
      ? page
      : key.upArrow
        ? -columns
        : key.downArrow
          ? columns
          : key.leftArrow
            ? -1
            : 1
  const current = Number(s.focus.slice(13)) || 0
  const selected = Math.max(0, Math.min(cloudChoices(s.cloud).length - 1, current + delta))
  return { patch: { selected, focus: `cloud-choice:${selected}`, hover: '' } }
}
