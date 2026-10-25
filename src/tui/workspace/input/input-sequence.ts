import type { Key } from 'ink'
import type { Canvas } from '../draw/canvas.js'
import { workspaceInput } from '../input.js'
import type { InputResult } from '../input-types.js'
import type { WorkspaceState } from '../state.js'
import { inputKeys } from './input-key.js'

export { inputKeys } from './input-key.js'

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
