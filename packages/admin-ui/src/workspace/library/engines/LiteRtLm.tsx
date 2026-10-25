import { useCallback, useEffect, useState } from 'react'
import type { LiteRtAcceleratorsView } from '@contract'
import { liteRtAcceleratorLines } from '@view'
import { describeError } from '@/services/admin-api'
import { Action } from '../../Controls'
import { useDialog } from '../../useDialog'
import type { Workspace } from '../../useWorkspace'

/**
 * LiteRT-LM's engine (spec litert-lm-server, «LiteRT-LM в TUI и admin»): the active build and the
 * accelerator the core offers here — `openvino` on an Intel NPU, with Prepare and its step while the
 * server prepares (read again at every snapshot while a prepare runs); nothing to prepare on Linux and
 * macOS. Install and Update build prepare openvino after them where it is offered, as `atc engines
 * install litert-lm` does. Closing it stops nothing.
 */
export function LiteRtLm({
  workspace: w,
  onClose,
  embedded = false,
}: {
  workspace: Workspace
  onClose: () => void
  embedded?: boolean
}) {
  const dialog = useDialog(onClose, !embedded)
  const [view, setView] = useState<LiteRtAcceleratorsView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { execute } = w
  const read = useCallback(async () => {
    try {
      const next = await execute<LiteRtAcceleratorsView>('litert.accelerators')
      setView(next)
      return next
    } catch (e) {
      setError(describeError(e))
      return null
    }
  }, [execute])
  const tick = view?.preparing ? w.snapshot?.captured_at : 0
  useEffect(() => {
    void read()
  }, [read, tick])
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
      await read()
    }
  }
  const install = () =>
    act(async () => {
      await execute('engines.install', { engine: 'litert-lm' })
      const after = await execute<LiteRtAcceleratorsView>('litert.accelerators')
      if (after.accelerators.some((a) => !a.prepared)) await execute('litert.prepare', {})
    })
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? undefined : 'ew-modal'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="LiteRT-LM"
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>LiteRT-LM</h2>
            <button className="ew-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {!view && !error && <p className="ew-muted">Reading the accelerator…</p>}
        {view?.installed && <p className="ew-muted">Installed: {view.build}</p>}
        {view && liteRtAcceleratorLines(view).map((line) => <p key={line}>{line}</p>)}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="ew-actions">
          {view && !view.installed && (
            <Action primary disabled={busy} onClick={install}>
              Install LiteRT-LM
            </Action>
          )}
          {view?.installed && !view.preparing && (
            <Action disabled={busy} onClick={install}>
              Update build
            </Action>
          )}
          {view?.installed &&
            !view.preparing &&
            view.accelerators
              .filter((a) => !a.prepared)
              .map((a) => (
                <Action
                  key={a.name}
                  disabled={busy}
                  onClick={() => act(() => execute('litert.prepare', { accelerators: [a.name] }))}
                >
                  Prepare {a.name}
                </Action>
              ))}
          <Action disabled={busy} onClick={() => act(read)}>
            Ask again
          </Action>
        </div>
      </section>
    </div>
  )
}
