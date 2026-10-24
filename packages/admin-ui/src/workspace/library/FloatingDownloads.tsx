import { useState } from 'react'
import { downloadRows, prioritizeDownloads } from '@view'
import type { Workspace } from '../useWorkspace'
import { Downloads } from './Downloads'
import { useDialog } from '../useDialog'
import { record, text } from '../types'
import { useDownloadEstimate } from './useDownloadEstimate'
import { useDownloadAttention } from './download-attention'
import './floating-downloads.css'

export function FloatingDownloads({
  workspace,
  onboarding = false,
}: {
  workspace: Workspace
  onboarding?: boolean
}) {
  const [open, setOpen] = useState(false)
  const attention = useDownloadAttention()
  const rows = prioritizeDownloads(
    downloadRows(workspace.snapshot?.setups ?? [], workspace.snapshot?.downloads ?? [])
  )
  const first = rows[0]
  if (!first && !open) return null
  const plan = record(first?.plan),
    percent = first?.total ? Math.min(100, Math.floor((first.transferred / first.total) * 100)) : undefined
  return (
    <>
      {first && (
        <aside
          key={attention}
          className={`floating-downloads ${onboarding ? 'during-setup' : ''} ${attention ? 'download-attention' : ''}`}
          aria-label="Download status"
        >
          <button onClick={() => setOpen(true)} aria-label="View downloads">
            <strong>{text(plan.name ?? first.model_id ?? first.name ?? first.id)}</strong>
            <span>{first.state.replaceAll('_', ' ')}</span>
            {rows.length > 1 && <span className="download-count">+{rows.length - 1} more</span>}
            <progress aria-label="Download progress" value={percent} max={100} />
            <DownloadEta row={first} />
          </button>
        </aside>
      )}
      {open && <DownloadPopover workspace={workspace} close={() => setOpen(false)} />}
    </>
  )
}
function DownloadEta({ row }: { row: Record<string, unknown> }) {
  const { eta } = useDownloadEstimate(row)
  return (
    <small>
      {/paused|cancelled|failed|interrupted/.test(String(row.state))
        ? row.kind === 'engine'
          ? 'Open Downloads to retry'
          : 'Open Downloads to resume'
        : eta !== undefined && Number.isFinite(eta) && eta >= 0
          ? `${eta < 60 ? Math.ceil(eta) + ' sec' : Math.ceil(eta / 60) + ' min'} remaining`
          : 'Estimating time…'}
    </small>
  )
}
function DownloadPopover({ workspace, close }: { workspace: Workspace; close: () => void }) {
  const dialog = useDialog(close)
  return (
    <div className="modal-shade">
      <section
        className="floating-download-dialog"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Downloads"
      >
        <header>
          <h2>Downloads</h2>
          <button onClick={close} aria-label="Close downloads">
            ×
          </button>
        </header>
        <Downloads workspace={workspace} compact showTitle={false} />
      </section>
    </div>
  )
}
