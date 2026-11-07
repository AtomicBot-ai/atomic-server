/** ANSI colours, on only for a terminal that wants them (`NO_COLOR`, `FORCE_COLOR`, `--no-color`). */

export interface Colors {
  enabled: boolean
  bold(text: string): string
  dim(text: string): string
  red(text: string): string
  green(text: string): string
  yellow(text: string): string
  cyan(text: string): string
}

const wrap = (open: number, close: number) => (text: string) => `\u001b[${open}m${text}\u001b[${close}m`
const identity = (text: string) => text

export function colorsFor(enabled: boolean): Colors {
  return enabled
    ? {
        enabled,
        bold: wrap(1, 22),
        dim: wrap(2, 22),
        red: wrap(31, 39),
        green: wrap(32, 39),
        yellow: wrap(33, 39),
        cyan: wrap(36, 39),
      }
    : {
        enabled,
        bold: identity,
        dim: identity,
        red: identity,
        green: identity,
        yellow: identity,
        cyan: identity,
      }
}

export function colorEnabled(facts: { isTTY: boolean; env: NodeJS.ProcessEnv; noColor: boolean }): boolean {
  if (facts.noColor) return false
  if (facts.env['NO_COLOR'] !== undefined && facts.env['NO_COLOR'] !== '') return false
  if (facts.env['FORCE_COLOR'] !== undefined && facts.env['FORCE_COLOR'] !== '0') return true
  if (facts.env['TERM'] === 'dumb') return false
  return facts.isTTY
}

/** Windows Terminal identifies itself with WT_SESSION without requiring COLORTERM. */
export function trueColorSupported(env: NodeJS.ProcessEnv): boolean {
  return /truecolor|24bit/i.test(env['COLORTERM'] ?? '') || Boolean(env['WT_SESSION'])
}

/** Strip ANSI sequences, for measuring and for tests. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}
