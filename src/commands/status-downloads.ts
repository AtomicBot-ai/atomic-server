/**
 * The server's downloads in `atc status` (spec managed-models-server: a store download is visible in
 * `atc status` too): every job of its workspace that is not done — GGUF setups, media, store models,
 * Foundry Local variants — with its stage and bytes; none when the workspace cannot be read.
 */

import type { CommandContext } from '../cli/index.js'
import type { WorkspaceSnapshot } from '../contract/index.js'
import { downloadRows, formatSize } from '../workspace-view/index.js'
import { workspace } from './control.js'

export interface StatusDownload {
  id: string
  model: string
  kind: string
  state: string
  transferred: number
  total: number
}

export async function statusDownloads(ctx: CommandContext): Promise<StatusDownload[]> {
  const snapshot = (await workspace(ctx, false)
    .then((w) => w.snapshot())
    .catch(() => null)) as WorkspaceSnapshot | null
  if (!snapshot) return []
  return downloadRows(snapshot.setups, snapshot.downloads).map((r) => ({
    id: r.id,
    model: String(r['model_id'] ?? r.id),
    kind: String(r['kind'] ?? r.owner),
    state: r.state,
    transferred: r.transferred,
    total: r.total,
  }))
}

export const downloadLine = (d: StatusDownload): [string, string] => [
  'download',
  `${d.model}: ${d.state}${d.total ? ` (${formatSize(d.transferred)} of ${formatSize(d.total)})` : ''} — ${d.id}`,
]
