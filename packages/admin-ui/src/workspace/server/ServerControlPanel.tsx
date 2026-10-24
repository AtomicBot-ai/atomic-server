// Lifted from Atomic-Chat/web-app/src/containers/ServerControlPanel.tsx @ 807b4d9; adapted: live API operations and model sessions.
import { useEffect, useState } from 'react'
import { Box, Cable, Cpu, Play, Square, LoaderCircle } from 'lucide-react'
import { connectionDownload, connectionDownloadTarget, engineName, inferenceReadiness } from '@view'
import { openAcquisition } from '../useAcquisition'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { highlightDownloads } from '../library/download-attention'
export function ServerControlPanel({
  workspace: w,
  selectSection,
  openSetup,
  prepared = [],
}: {
  workspace: Workspace
  selectSection: (id: string) => void
  openSetup: () => void
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
  const running = Boolean(w.snapshot?.api.running)
  const transition = w.pending.find((name) => ['api.start', 'api.stop', 'api.restart'].includes(name))
  const transitionLabel =
    transition === 'api.stop' ? 'Stopping…' : transition === 'api.restart' ? 'Restarting…' : 'Starting…'
  const service = w.snapshot?.services.find(
    (item) => item.kind === 'chat' && ['ready', 'loaded', 'running'].includes(item.state)
  )
  const target = connectionDownloadTarget(connectionDownload(w.snapshot?.setups ?? []))
  const engine = service?.provider || preferredEngine || target.provider
  const model = service?.model || target.model
  const readiness = inferenceReadiness(w.snapshot)
  return (
    <section className="desktop-server-control" aria-label="Server control panel">
      <div className={`server-power ${running ? 'is-running' : ''} ${transition ? 'is-changing' : ''}`}>
        <Action
          primary={!running}
          disabled={Boolean(transition)}
          title={!running && !readiness.ready ? readiness.message : undefined}
          ariaLabel={transition ? transitionLabel : running ? 'Stop server' : 'Start server'}
          onClick={async () => {
            if (!running && !readiness.ready) {
              setShowReadiness(true)
              if (readiness.waiting) return highlightDownloads()
              return readiness.acquire ? openAcquisition(readiness.acquire) : openSetup()
            }
            setShowReadiness(false)
            await w.execute(running ? 'api.stop' : 'api.start')
          }}
        >
          {running && (
            <svg className="server-running-border" aria-hidden="true">
              <rect pathLength="100" rx="18" />
            </svg>
          )}
          <span className="server-power-label" key={transition || String(running)}>
            {transition ? (
              <LoaderCircle className="server-state-spinner" size={14} />
            ) : running ? (
              <Square size={14} />
            ) : (
              <Play size={14} />
            )}
            {transition ? transitionLabel : running ? 'Stop' : 'Start'}
          </span>
        </Action>
      </div>
      {showReadiness && !running && !readiness.ready && (
        <small className="server-readiness" role="status">
          {readiness.message}
        </small>
      )}
      <button className="server-control-detail" onClick={() => selectSection('model')}>
        <Cpu size={15} />
        <span>Engine</span>
        <strong>{engine ? engineName(engine) : 'Not selected'}</strong>
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
