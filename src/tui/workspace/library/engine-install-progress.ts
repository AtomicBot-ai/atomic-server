/** Installation stays visible until the request and accelerator preparation finish. */
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { engineName, engineProgress, formatSize } from '../../../workspace-view/index.js'
import type { EnginePanel, PanelLine, PanelButton } from './engine-panel-model.js'
import { record } from './library-model.js'

/** Server-owned installs can start in intro or another client before this panel opens. */
export function queuedInstallation(p: EnginePanel, live: WorkspaceSnapshot | null) {
  const job = (live?.downloads ?? []).find((value) => {
    const row = record(value)
    return (
      row['kind'] === 'engine' &&
      row['engine'] === p.engine &&
      !['ready', 'failed', 'interrupted', 'cancelled'].includes(String(row['stage']))
    )
  }) as { taskId?: string; id?: string } | undefined
  const taskId = job?.taskId ?? job?.id
  return taskId ? { taskId, stage: 'installing' as const } : null
}

export function installationModel(p: EnginePanel, live: WorkspaceSnapshot | null) {
  const operation = p.installation!
  const progress = engineProgress(live?.downloads ?? [], operation.taskId)
  const preparing = operation.stage === 'preparing'
  const lines: PanelLine[] = [
    { text: engineName(p.engine), tone: 'title' },
    { text: preparing ? 'Preparing accelerators…' : 'Installing engine…', tone: 'text' },
  ]
  if (!preparing) {
    lines.push({
      text: progress.total
        ? `${progress.status} · ${progress.percent}% · ${formatSize(progress.transferred)} / ${formatSize(progress.total)}`
        : 'Waiting for download progress…',
      tone: 'muted',
    })
  }
  lines.push({ text: 'You can close this panel; the server continues the installation.', tone: 'muted' })
  const buttons: PanelButton[] = [{ id: 'close', label: 'Close', hint: 'Work goes on in the server' }]
  return { lines, fields: [] as PanelButton[], buttons }
}
