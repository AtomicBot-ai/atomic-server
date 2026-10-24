import type { Key } from 'ink'
import type { Canvas } from './draw/canvas.js'
import { workspaceInput } from './input.js'
import type { InputResult } from './input-types.js'
import type { WorkspaceState } from './state.js'

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

/** Every key of one Ink event, in order, each one seeing what the one before it patched. */
export function workspaceInputs(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas,
  leader = false
): InputResult[] {
  const results: InputResult[] = []
  let state = s,
    lead = leader
  for (const event of inputKeys(input, key)) {
    const result = workspaceInput(event.input, event.key, state, frame, lead)
    results.push(result)
    if (result.patch) state = { ...state, ...result.patch }
    lead = result.leader ?? false
  }
  return results
}
