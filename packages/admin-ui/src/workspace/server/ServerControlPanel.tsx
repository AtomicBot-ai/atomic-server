// Lifted from Atomic-Chat/web-app/src/containers/ServerControlPanel.tsx @ 807b4d9; adapted: live API operations and model sessions.
import { useEffect, useState } from 'react'
import { Box, Cable, Cpu, Play, Square, LoaderCircle } from 'lucide-react'
import { apiDownloadWait, engineName, inferenceReadiness, serverPanelSelection } from '@view'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { highlightDownloads } from '../library/downloads/download-attention'
export function ServerControlPanel({
  workspace: w,
  selectSection,
  prepared = [],
}: {
  workspace: Workspace
  selectSection: (id: string) => void
  prepared?: string[]
}) {
  const execute = w.execute
  const [preferredEngine, setPreferredEngine] = useState('')
  const [showReadiness, setShowReadiness] = useState(false)
  const captured = w.snapshot?.captured_at
  useEffect(() => {
    let live = true
    void execute<{ engine?: string }>('engines.selected')
      .then((v) => {
        if (live) setPreferredEngine(v?.engine ?? '')
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [execute, captured])
  const waiting = apiDownloadWait(w.snapshot)
  const running = !waiting && Boolean(w.snapshot?.api.running)
  const transition = w.pending.find((name) => ['api.start', 'api.stop', 'api.restart'].includes(name))
  const transitionLabel =
    transition === 'api.stop' ? 'Stopping…' : transition === 'api.restart' ? 'Restarting…' : 'Starting…'
  const { engine, model } = serverPanelSelection(w.snapshot, preferredEngine)
  const readiness = inferenceReadiness(w.snapshot)
  return (
    <section className="desktop-server-control" aria-label="Server control panel">
      <div
        className={`server-power ${running ? 'is-running' : ''} ${transition ? 'is-changing' : ''} ${waiting ? 'is-waiting' : ''}`}
      >
        <Action
          primary={!running && !waiting}
          unavailable={Boolean(waiting)}
          disabled={Boolean(transition)}
          title={waiting?.message ?? (!running && !readiness.ready ? readiness.message : undefined)}
          ariaLabel={waiting?.label ?? (transition ? transitionLabel : running ? 'Stop API' : 'Start API')}
          onClick={async () => {
            if (waiting) {
              setShowReadiness(true)
              highlightDownloads()
              return
            }
            setShowReadiness(!running)
            if (!running && readiness.waiting) highlightDownloads()
            await w.execute(running ? 'api.stop' : 'api.start', running ? {} : { restore_selected: true })
          }}
        >
          {running && (
            <svg className="server-running-border" aria-hidden="true">
              <rect pathLength="100" rx="18" />
            </svg>
          )}
          <span className="server-power-label" key={transition || String(running)}>
            {waiting || transition ? (
              <LoaderCircle className="server-state-spinner" size={14} />
            ) : running ? (
              <Square size={14} />
            ) : (
              <Play size={14} />
            )}
            {waiting?.label ?? (transition ? transitionLabel : running ? 'Stop API' : 'Start API')}
          </span>
        </Action>
      </div>
      {showReadiness && !readiness.ready && (
        <small className="server-readiness" role="status">
          {waiting?.message ?? readiness.message}
        </small>
      )}
      <button className="server-control-detail" onClick={() => selectSection('model')}>
        <Cpu size={15} />
        <span>Engine</span>
        <strong>{engine ? engineName(engine.split('|')[0]!) : 'Not selected'}</strong>
      </button>
      <button className="server-control-detail" onClick={() => selectSection('model')}>
        <Box size={15} />
        <span>Model</span>
        <strong title={model}>{model || 'Not selected'}</strong>
      </button>
      <button className="server-control-detail" onClick={() => selectSection('connect')}>
        <Cable size={15} />
        <span>Connections</span>
        <strong className={`server-connection-count ${prepared.length ? 'has-connections' : ''}`}>
          {prepared.length} <span>prepared</span>
        </strong>
      </button>
    </section>
  )
}
