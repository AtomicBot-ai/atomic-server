import { AGENTS } from '../../../agent-launch/index.js'
import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { serverEndpoint } from '../actions.js'
import { fill } from '../draw/fortress.js'
export function drawServer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  fill(c, x, y, width, 4, COLORS.surface)
  text(
    c,
    x + 1,
    y,
    s.workspace?.api.endpoint ?? serverEndpoint(s),
    COLORS.text,
    width - 2,
    COLORS.surface,
    true
  )
  let ax = x + 1
  for (const [id, label, hint] of [
    ['copy-endpoint', 'Copy address', 'Copy OpenAI-compatible base URL'],
    ['copy-key', 'Copy API key', 'Copy a working local API key'],
    ['page:keys', 'API keys', 'Create, copy or revoke named keys'],
    ['examples', 'Example', 'Copy a curl request'],
  ]) {
    if (ax + label!.length + 2 > x + width) break
    ax += button(c, id!, ax, y + 2, label!, hint!, focus) + 1
  }
  let row = y + 4,
    bx = x
  for (const a of AGENTS) {
    if (bx + a.name.length + 4 > x + width) {
      bx = x
      row++
    }
    if (row >= bottom - 2) break
    bx +=
      button(c, `agent:${a.id}`, bx, row, `${a.name} >`, `Launch ${a.name} with this API and model`, focus) +
      1
  }
  bx = x
  for (const [id, label, hint] of [
    ['choose-goal', 'Setup', 'Choose a goal and prepare a workload'],
    ['console', 'Console', 'Run a named server operation'],
    ['agent-setup', 'Agent setup', 'MCP and command interface for external agents'],
  ]) {
    if (bx + label!.length + 2 > x + width) break
    bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  }
}
