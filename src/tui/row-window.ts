// Lifted from atomic-agent/src/tui/row-window.ts @ 2a6d58b; adapted: house style, `computeWindowStart`
// folded in.

/**
 * Cursor-aware list windowing. Ink cannot clip a frame taller than the terminal — when the frame
 * is higher than `stdout.rows` its redraw drifts and lines overlap — so a list renders only the
 * slice that fits, keeping the cursor row in view and saying how much is hidden.
 */

export interface RowWindow {
  /** Index of the first visible row. */
  start: number
  /** Rows in the visible slice (≤ maxRows). */
  count: number
  hiddenBefore: number
  hiddenAfter: number
}

export function computeRowWindow(total: number, cursor: number, maxRows: number): RowWindow {
  const size = Math.max(1, Math.floor(maxRows))
  if (total <= 0) return { start: 0, count: 0, hiddenBefore: 0, hiddenAfter: 0 }
  const at = Math.max(0, Math.min(cursor, total - 1))
  const start = total <= size || at < size ? 0 : Math.min(at - size + 1, total - size)
  const count = Math.min(size, total - start)
  return { start, count, hiddenBefore: start, hiddenAfter: Math.max(0, total - start - count) }
}

/** ASCII arrows remain legible in Windows console fonts. */
export function rowWindowHint(window: Pick<RowWindow, 'hiddenBefore' | 'hiddenAfter'>): string {
  return [
    window.hiddenBefore ? `^ ${window.hiddenBefore} above` : '',
    window.hiddenAfter ? `v ${window.hiddenAfter} below` : '',
  ]
    .filter(Boolean)
    .join('  ')
}
