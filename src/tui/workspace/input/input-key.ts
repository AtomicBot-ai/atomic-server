import type { Key } from 'ink'

/** Legacy xterm modified-Enter encodings complement Ink's CSI-u/Kitty parser. */
export function inputKey(input: string, key: Key): { input: string; key: Key } {
  // eslint-disable-next-line no-control-regex
  return /^(?:\u001b)?\[(?:27;2;13~|13;2~)$/.test(input)
    ? { input: '', key: { ...key, return: true, shift: true } }
    : { input, key }
}

/**
 * The keys behind one Ink event. Ink holds a lone Esc for 20 ms and, when the next key comes first, parses
 * both as one event with the Esc stripped: a C0 control byte without the Ctrl flag, which a keypress of its
 * own never is. That event is Esc followed by Ctrl+letter (Esc then Ctrl+Q on a busy machine or SSH link).
 */
export function inputKeys(input: string, key: Key): { input: string; key: Key }[] {
  const code = input.length === 1 ? input.charCodeAt(0) : 0
  if (code >= 1 && code <= 26 && !key.ctrl && !key.tab && !key.return && !key.backspace)
    return [
      { input: '', key: { escape: true } as Key },
      { input: String.fromCharCode(code + 96), key: { ctrl: true } as Key },
    ]
  return [{ input, key }]
}

/**
 * Enter on the focused (or hovered) control. A focus the screen no longer draws (an overlay closed, a
 * step changed) is moved to the first control, never activated: Enter must not run whatever is first.
 */
export function focusedTarget(
  s: { hover: string; focus: string },
  frame: { targets: { id: string }[] }
): { action?: string; patch: { focus: string; hover: string } } {
  const id = frame.targets.find((t) => t.id === (s.hover || s.focus))?.id
  if (!id) return { patch: { focus: frame.targets[0]?.id ?? '', hover: '' } }
  return { action: id, patch: { focus: id, hover: '' } }
}
