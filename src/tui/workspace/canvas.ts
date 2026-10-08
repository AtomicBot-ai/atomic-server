import type { Drawing } from './art.js'
export const COLORS = {
  black: '#000000',
  text: '#f2f4f4',
  muted: '#a3aaac',
  stone: '#596164',
  line: '#303638',
  red: '#b2fff4',
  gold: '#53dcca',
  green: '#70c9bf',
  ground: '#090b0c',
  focus: '#17322f',
  surface: '#171b1d',
  header: '#202628',
  composer: '#effaf7',
  composerFrame: '#b7d4cd',
  composerInk: '#102d28',
  engineButton: '#265951',
  modelButton: '#c0e6de',
  sendButton: '#50d5bf',
}

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
      c.cells[y]![at] = { char, color, ...(background ? { background } : {}), ...(bold ? { bold } : {}) }
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
    selected || focused === id ? COLORS.gold : COLORS.text,
    width,
    selected || focused === id ? COLORS.focus : COLORS.surface,
    bold
  )
  c.targets.push({ id, x, y, width: Math.min(width, c.width - x), height: 1, hint })
  return width
}
export function hit(c: Canvas, x: number, y: number): Target | undefined {
  return [...c.targets].reverse().find((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height)
}
