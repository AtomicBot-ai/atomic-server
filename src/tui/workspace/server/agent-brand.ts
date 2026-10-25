import { COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'

/** Shared ASCII identities: retain each agent's brand color in every terminal surface. */
const BRANDS: Record<string, [string, string]> = {
  'claude': ['[o.o]', '#d77757'],
  'codex': ['{*}', '#8b8dff'],
  'atomic-agent': ['(@)', '#006aff'],
  'kilo': ['|K|', '#f8e856'],
  'pi': ['[pi]', '#f2f4f4'],
  'opencode': ['[[]]', '#e8e8e8'],
  'openclaude': ['[-.-]', '#d77757'],
  'cline': ['[=]', '#e6e9ed'],
  'dsh': ['><>', '#4d6bfe'],
  'zed': ['/Z/', '#e4e4e7'],
  'zcode': ['[Z]', '#b4a2ff'],
  'mimo': ['[Mi]', '#ff6700'],
  'droid': ['<*>', '#fafafa'],
  'copilot': ['(o-o)', '#f2f4f4'],
  'openhands': ['\\o/', '#ffe165'],
  'poolside': ['~~~', '#6a62ff'],
  'goose': ['(o)>', '#f2f4f4'],
  'muse': ['(oo)', '#0082fb'],
  'hermes': ['<H>', '#e9be72'],
  'openclaw': ['>o<', '#f17474'],
  'vscode': ['</>', '#4ea8ec'],
  'jetbrains': ['[JB]', '#ed68c0'],
  'xcode': ['[X]', '#63b4f5'],
}
export const agentMark = (id: string) => BRANDS[id]?.[0] ?? '[>]'
export const agentColor = (id: string) => BRANDS[id]?.[1] ?? COLORS.muted
export function drawAgentLabel(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  id: string,
  label: string,
  color: string = COLORS.text,
  bold = false
) {
  const mark = agentMark(id)
  text(c, x, y, mark, agentColor(id), width, undefined, true)
  text(c, x + mark.length + 1, y, label, color, Math.max(0, width - mark.length - 1), undefined, bold)
}
