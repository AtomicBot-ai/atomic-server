/**
 * Text that came from the account service or another device, made safe to print: no control characters
 * (a terminal would run an escape sequence in a device name) and no bidirectional overrides.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

export function cleanText(value: unknown, max = 100): string | null {
  if (typeof value !== 'string') return null
  const text = [...value.replace(UNSAFE, '').trim()].slice(0, max).join('')
  return text || null
}
