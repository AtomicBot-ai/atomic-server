import { engineName } from '@view'
import { Action, Empty, Panel } from '../Controls'
import { record, text } from '../types'
import type { Execute, RecordValue } from '../types'

/** Open an engine once; its settings, builds and updates share one dialog. */
export function EnginesTab({
  engines,
  loading,
  onSettings,
}: {
  engines: RecordValue[]
  loading: boolean
  execute: Execute
  onManaged: (engine: string) => void
  onFoundry: () => void
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
            <p className="ew-muted">
              {engine.active
                ? `Installed · ${text(record(engine.active).version)}`
                : Array.isArray(engine.builds) && engine.builds.length
                  ? 'Installed'
                  : 'Not installed'}
            </p>
            {Boolean(engine.source_error) && <p role="alert">{text(engine.source_error)}</p>}
          </Panel>
        ))
      )}
    </>
  )
}
