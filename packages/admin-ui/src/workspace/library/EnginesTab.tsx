import { Action, Empty, Panel } from '../Controls'
import { record, rows, text } from '../types'
import type { Execute, RecordValue } from '../types'

/** The Engines tab: each engine the core registers, its builds, and the way into its setup or settings. */
export function EnginesTab({
  engines,
  loading,
  execute,
  onManaged,
  onAccelerators,
  onSettings,
}: {
  engines: RecordValue[]
  loading: boolean
  execute: Execute
  onManaged: (engine: string) => void
  /** Foundry Local's and LiteRT-LM's dialog: accelerators, and an install or update that prepares them. */
  onAccelerators: (engine: string) => void
  onSettings: (engine: string) => void
}) {
  const accelerated = (engine: unknown) => engine === 'foundry-local' || engine === 'litert-lm'
  return (
    <>
      {loading ? (
        <Empty>Checking engines…</Empty>
      ) : (
        engines.map((engine) => (
          <Panel
            key={text(engine.engine)}
            title={text(engine.engine)}
            actions={
              // A managed engine's setup is a plan to agree to: the modal, never a direct install.
              <>
                {accelerated(engine.engine) && (
                  <Action onClick={() => onAccelerators(text(engine.engine))}>
                    {engine.engine === 'litert-lm' ? 'Accelerator' : 'Accelerators'}
                  </Action>
                )}
                <Action
                  onClick={() =>
                    engine.kind === 'managed'
                      ? onManaged(text(engine.engine))
                      : accelerated(engine.engine)
                        ? onAccelerators(text(engine.engine))
                        : execute('engines.install', { engine: engine.engine })
                  }
                >
                  {engine.active ? (engine.kind === 'managed' ? 'Manage' : 'Update') : 'Install'}
                </Action>
              </>
            }
          >
            <p className="ew-muted">
              {text(engine.kind)} ·{' '}
              {engine.active ? `Active: ${text(record(engine.active).version)}` : 'Not installed'}
            </p>
            {Boolean(engine.source_error) && <p className="ew-muted">{text(engine.source_error)}</p>}
            {rows(engine.builds).map((build) => (
              <div className="installed-row" key={`${text(build.version)}-${text(build.variant)}`}>
                <div>
                  <strong>{text(build.version)}</strong>
                  <small>
                    {text(build.variant)}
                    {build.in_use ? ' · In use' : ''}
                  </small>
                </div>
                <div className="ew-actions">
                  <Action
                    disabled={Boolean(build.active) || engine.active_choice !== 'client'}
                    onClick={() =>
                      execute('engines.activate', {
                        engine: engine.engine,
                        version: build.version,
                        variant: build.variant,
                      })
                    }
                  >
                    {build.active ? 'Active' : 'Activate'}
                  </Action>
                  <Action
                    disabled={!build.removable}
                    title={text(build.not_removable_reason, '')}
                    onClick={() => {
                      if (window.confirm('Remove this engine build?'))
                        return execute('engines.remove', {
                          engine: engine.engine,
                          version: build.version,
                          variant: build.variant,
                        })
                    }}
                  >
                    Remove
                  </Action>
                </div>
              </div>
            ))}
            <Action onClick={() => onSettings(text(engine.engine))}>Engine settings</Action>
          </Panel>
        ))
      )}
    </>
  )
}
