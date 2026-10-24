import { drawServerOverview } from './server-overview.js'
import { drawServerConnections } from './server-connections.js'
import { drawServerSettings } from './server-settings.js'
import { drawServerRemote } from './server-remote.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
export function drawServer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  if (s.serverView === 'remote') return drawServerRemote(c, s, x, y, width, bottom, focus)
  if (s.serverView === 'overview') return drawServerOverview(c, s, x, y, width, bottom, focus)
  if (['model', 'configuration', 'proxy'].includes(s.serverView))
    return drawServerSettings(c, s, x, y, width, bottom, focus)
  drawServerConnections(c, s, x, y, width, bottom, focus)
}
