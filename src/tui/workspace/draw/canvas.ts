import type { Drawing } from './art.js'
import { WORKSPACE_COLORS } from '../../../contract/index.js'
export const COLORS = WORKSPACE_COLORS

export interface Cell {
  char: string
  color: string
  background?: string
  bold?: boolean
}
export interface Target {
  id: string
  x: number
  y: number
  width: number
  height: number
  hint: string
}
export interface Canvas {
  contentTop?: number
  popover?: { x: number; y: number; width: number; height: number }
  cells: Cell[][]
  targets: Target[]
  width: number
  height: number
}
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
export const graphemes = (s: string): string[] => [...segmenter.segment(s)].map((v) => v.segment)
export function cellWidth(s: string): number {
  const cp = s.codePointAt(0) ?? 0
  return /\p{Extended_Pictographic}/u.test(s) ||
    (cp >= 0x1100 &&
      (cp <= 0x115f ||
        (cp >= 0x2e80 && cp <= 0xa4cf) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xff01 && cp <= 0xff60) ||
        cp >= 0x20000))
    ? 2
    : 1
}
export const textWidth = (s: string): number => graphemes(s).reduce((n, g) => n + cellWidth(g), 0)
export function cleanText(s: string): string {
  // Server output is text, never terminal control sequences.
  /* eslint-disable no-control-regex */
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\t/g, '  ')
  /* eslint-enable no-control-regex */
}
export function canvas(width: number, height: number): Canvas {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ char: ' ', color: COLORS.text }))
    ),
    targets: [],
  }
}
export function text(
  c: Canvas,
  x: number,
  y: number,
  value: string,
  color: string = COLORS.text,
  max = c.width - x,
  background?: string,
  bold?: boolean
): void {
  let at = x
  for (const char of graphemes(cleanText(value).replace(/\n/g, ' '))) {
    const n = cellWidth(char)
    if (at + n > x + max || at + n > c.width) break
    if (y >= 0 && y < c.height && at >= 0) {
      const surface = background ?? c.cells[y]![at]?.background
      c.cells[y]![at] = {
        char,
        color,
        ...(surface ? { background: surface } : {}),
        ...(bold ? { bold } : {}),
      }
      if (n === 2) c.cells[y]![at + 1] = { ...c.cells[y]![at]!, char: '' }
    }
    at += n
  }
}
export function wrap(value: string, width: number): string[] {
  if (width < 1) return []
  const rows: string[] = []
  for (const line of cleanText(value).split('\n')) {
    let row = '',
      n = 0
    for (const g of graphemes(line)) {
      const w = cellWidth(g)
      if (n + w > width) {
        rows.push(row)
        row = ''
        n = 0
      }
      row += g
      n += w
    }
    rows.push(row)
  }
  return rows
}
/** Wrap readable prose at word boundaries; only oversized words are split into cells. */
export function wrapWords(value: string, width: number): string[] {
  if (width < 1 || !value) return []
  const rows: string[] = []
  for (const paragraph of cleanText(value).split('\n')) {
    let line = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(candidate) <= width) line = candidate
      else {
        if (line) rows.push(line)
        const pieces = wrap(word, width)
        rows.push(...pieces.slice(0, -1))
        line = pieces.at(-1) ?? ''
      }
    }
    rows.push(line)
  }
  return rows
}
export function art(c: Canvas, x: number, y: number, drawing: Drawing): void {
  drawing.forEach((row, dy) =>
    row.forEach((cell, dx) => {
      if (cell.char !== ' ') text(c, x + dx, y + dy, cell.char, cell.color, 1)
    })
  )
}
export function rule(c: Canvas, x: number, y: number, width: number): void {
  text(c, x, y, '-'.repeat(Math.max(0, width)), COLORS.line, width)
}
export function button(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  label: string,
  hint: string,
  focused?: string,
  selected = false,
  bold = false
): number {
  const shown = ` ${label} `,
    width = textWidth(shown)
  text(
    c,
    x,
    y,
    shown,
    selected || focused === id ? COLORS.ground : COLORS.text,
    width,
    selected || focused === id ? COLORS.gold : COLORS.surface,
    bold
  )
  c.targets.push({ id, x, y, width: Math.min(width, c.width - x), height: 1, hint })
  return width
}
export function hit(c: Canvas, x: number, y: number): Target | undefined {
  return [...c.targets].reverse().find((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height)
}
