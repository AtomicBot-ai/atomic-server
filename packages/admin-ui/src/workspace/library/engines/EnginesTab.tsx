import { engineName, engineStatus } from '@view'
import type { WorkspaceSnapshot } from '@contract'
import { Action, Empty, Panel } from '../../Controls'
import { text } from '../../types'
import type { RecordValue } from '../../types'

/** Open an engine once; its settings, builds and updates share one dialog. */
export function EnginesTab({
  engines,
  snapshot,
  loading,
  onSettings,
}: {
  engines: RecordValue[]
  /** Installs in progress (`downloads`, `engines`), said on the engine's line. */
  snapshot?: WorkspaceSnapshot | null
  loading: boolean
  onSettings: (engine: string) => void
}) {
  return (
    <>
      {loading ? (
        <Empty>Checking engines…</Empty>
      ) : (
        engines.map((engine) => (
          <Panel
            key={text(engine.engine)}
            title={engineName(text(engine.engine))}
            actions={<Action onClick={() => onSettings(text(engine.engine))}>Engine settings</Action>}
          >
            <p className="ew-muted">{engineStatus(engine, snapshot)}</p>
            {Boolean(engine.source_error) && <p role="alert">{text(engine.source_error)}</p>}
          </Panel>
        ))
      )}
    </>
  )
}
