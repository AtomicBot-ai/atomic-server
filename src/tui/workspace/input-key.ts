import type { Key } from 'ink'

/** Legacy xterm modified-Enter encodings complement Ink's CSI-u/Kitty parser. */
export function inputKey(input: string, key: Key): { input: string; key: Key } {
  // eslint-disable-next-line no-control-regex
  return /^(?:\u001b)?\[(?:27;2;13~|13;2~)$/.test(input)
    ? { input: '', key: { ...key, return: true, shift: true } }
    : { input, key }
}
