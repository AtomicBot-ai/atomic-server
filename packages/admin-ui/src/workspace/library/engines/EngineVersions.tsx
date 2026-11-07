import { engineName } from '@view'
import { StatusIndicator } from '../../StatusIndicator'
import { Action } from '../../Controls'
import { useConfirmation } from '../../use-confirmation'
import { text } from '../../types'
import type { Execute, RecordValue } from '../../types'

export function EngineVersions({
  provider,
  builds,
  activeChoice,
  execute,
  busy,
  onChanged,
}: {
  provider: string
  builds: RecordValue[]
  activeChoice: unknown
  execute: Execute
  busy: boolean
  onChanged: () => Promise<void>
}) {
  const { ask, confirmation, waiting } = useConfirmation()
  const disabled = busy || waiting
  if (!builds.length) return null
  return (
    <>
      <details className="engine-versions">
        <summary>Installed versions ({builds.length})</summary>
        {builds.map((build) => (
          <div className="installed-row" key={`${text(build.version)}-${text(build.variant)}`}>
            <div>
              <div className="engine-version-identity">
                <strong>{text(build.version)}</strong>
                {Boolean(build.active) && <StatusIndicator tone="positive">Active</StatusIndicator>}
              </div>
              <small>
                {text(build.variant)}
                {build.in_use ? ' · In use' : ''}
              </small>
            </div>
            <div className="ew-actions">
              {!build.active && (
                <Action
                  disabled={disabled || activeChoice !== 'client'}
                  onClick={async () => {
                    await execute('engines.activate', {
                      engine: provider,
                      version: build.version,
                      variant: build.variant,
                    })
                    await onChanged()
                  }}
                >
                  Activate
                </Action>
              )}
              <Action
                disabled={!build.removable || disabled}
                title={text(build.not_removable_reason, '')}
                onClick={() =>
                  ask({
                    title: 'Remove engine build?',
                    actionLabel: 'Remove build',
                    danger: true,
                    children: (
                      <p>
                        {engineName(provider)} · {text(build.version)} · {text(build.variant)}
                      </p>
                    ),
                    onConfirm: async () => {
                      await execute('engines.remove', {
                        engine: provider,
                        version: build.version,
                        variant: build.variant,
                      })
                      await onChanged()
                    },
                  })
                }
              >
                Remove
              </Action>
            </div>
          </div>
        ))}
      </details>
      {confirmation}
    </>
  )
}
