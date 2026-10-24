// Lifted from atomic-chat-ui/web-app/src/routes/settings/general.tsx @ 807b4d9; adapted: supported server settings grouped under General.
import { SERVER_SETTINGS_GROUPS } from '@contract'
import { useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, JsonResult } from '../Controls'
import { RuntimeSettings } from './RuntimeSettings'
import { ServerConfiguration } from './ServerConfiguration'

export function GeneralSettings({
  workspace,
  openCommand,
  openEngines,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  openEngines: () => void
}) {
  const [opened, setOpened] = useState<string[]>([])
  return (
    <>
      <section className="settings-card">
        <h2 className="settings-card-heading">About</h2>
        <div className="settings-item">
          <strong>Core version</strong>
          <span>{workspace.snapshot?.core.version ?? 'Not reported'}</span>
        </div>
      </section>
      <RuntimeSettings workspace={workspace} section="admin" />
      <div className="settings-general-advanced">
        {SERVER_SETTINGS_GROUPS.map((group) => (
          <details
            className="settings-card"
            key={group.id}
            onToggle={(event) => {
              if (event.currentTarget.open)
                setOpened((current) => (current.includes(group.id) ? current : [...current, group.id]))
            }}
          >
            <summary>{group.label}</summary>
            {opened.includes(group.id) &&
              (group.id === 'api' ? (
                <ServerConfiguration workspace={workspace} />
              ) : group.id === 'diagnostics' ? (
                <>
                  <div className="ew-actions">
                    {[
                      ['hardware.info', 'Hardware'],
                      ['hardware.devices', 'Devices'],
                      ['logs.read', 'Server logs'],
                      ['models.logs', 'Model logs'],
                    ].map(([name, label]) => (
                      <Action key={name} onClick={() => openCommand(name)}>
                        {label}
                      </Action>
                    ))}
                  </div>
                  <p>
                    {workspace.snapshot?.errors.length
                      ? `${workspace.snapshot.errors.length} recent errors`
                      : 'No recent errors reported.'}
                  </p>
                  <details>
                    <summary>Technical report</summary>
                    <JsonResult
                      value={{ core: workspace.snapshot?.core, errors: workspace.snapshot?.errors }}
                    />
                  </details>
                </>
              ) : (
                <RuntimeSettings workspace={workspace} section={group.id} />
              ))}
            {group.id === 'engines' && <Action onClick={openEngines}>Manage inference engines</Action>}
          </details>
        ))}
      </div>
    </>
  )
}
