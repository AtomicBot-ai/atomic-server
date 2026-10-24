import { useCallback, useEffect, useState } from 'react'
import type { FoundryAcceleratorsView } from '@contract'
import { acceleratorLabel, acceleratorLines } from '@view'
import { describeError } from '@/services/admin-api'
import { Action } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'

/**
 * Foundry Local's accelerators (spec foundry-local-server): what the library found, each one's Prepare,
 * and each accelerator's step while the server prepares (`foundry.accelerators`' `steps`, read again at
 * every snapshot while a prepare runs); Install when the engine is absent and Update build when it is
 * there, each preparing after it as `atc engines install foundry-local` does. Closing it stops nothing.
 */
export function FoundryLocal({
  workspace: w,
  onClose,
  embedded = false,
}: {
  workspace: Workspace
  onClose: () => void
  embedded?: boolean
}) {
  const dialog = useDialog(onClose, !embedded)
  const [view, setView] = useState<FoundryAcceleratorsView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { execute } = w
  const read = useCallback(async () => {
    try {
      setView(await execute<FoundryAcceleratorsView>('foundry.accelerators'))
    } catch (e) {
      setError(describeError(e))
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
  // An update installs a new build, which registers nothing yet: prepare after it, as the install does.
  const install = () =>
    act(async () => {
      await execute('engines.install', { engine: 'foundry-local' })
      await execute('foundry.prepare', {})
    })
  const preparable = (view?.accelerators ?? []).filter((a) => !a.prepared && a.execution_provider !== null)
  return (
    <div className={embedded ? 'engine-setup-inline' : 'modal-shade'}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={embedded ? undefined : 'ew-modal'}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="Foundry Local"
      >
        {!embedded && (
          <div className="panel-heading">
            <h2>Foundry Local</h2>
            <button className="ew-button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {!view && !error && <p className="ew-muted">Reading the accelerators…</p>}
        {view && acceleratorLines(view).map((line) => <p key={line}>{line}</p>)}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="ew-actions">
          {view && !view.installed && (
            <Action primary disabled={busy} onClick={install}>
              Install Foundry Local
            </Action>
          )}
          {view?.installed && !view.preparing && (
            <Action disabled={busy} onClick={install}>
              Update build
            </Action>
          )}
          {view?.installed &&
            !view.preparing &&
            preparable.map((a) => (
              <Action
                key={a.name}
                disabled={busy}
                onClick={() => act(() => execute('foundry.prepare', { accelerators: [a.name] }))}
              >
                Prepare {acceleratorLabel(a)}
              </Action>
            ))}
          <Action
            disabled={busy}
            onClick={() =>
              act(() =>
                execute<FoundryAcceleratorsView>('foundry.accelerators', { force: true }).then(setView)
              )
            }
          >
            Ask the library again
          </Action>
        </div>
      </section>
    </div>
  )
}
