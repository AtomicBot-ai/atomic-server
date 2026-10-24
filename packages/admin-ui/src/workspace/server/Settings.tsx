// Lifted from Atomic-Chat/web-app/src/routes/settings/general.tsx, interface.tsx and shortcuts.tsx @ 5043013; adapted: supported server settings.
import { SETTINGS_SECTIONS, SETTINGS_WORKSPACE_SECTIONS, SERVER_SETTINGS_GROUPS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, JsonResult, Panel } from '../Controls'
import { RuntimeSettings } from './RuntimeSettings'
import { ServerConfiguration } from './ServerConfiguration'
import { HardwareSettings } from './HardwareSettings'
import { GeneralSettings } from './GeneralSettings'
import { InterfaceSettings } from './InterfaceSettings'
import { WorkspaceSettings } from './WorkspaceSettings'
import './settings-desktop.css'

export function Settings({
  workspace: w,
  section,
  openCommand,
  openEngines,
}: {
  workspace: Workspace
  section: string
  openCommand: (name: string) => void
  openEngines: () => void
}) {
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>
            {[...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS, ...SERVER_SETTINGS_GROUPS].find(
              (s) => s.id === section
            )?.label ?? 'Settings'}
          </h1>
        </div>
      </div>
      {section === 'admin' ? (
        <GeneralSettings workspace={w} openCommand={openCommand} openEngines={openEngines} />
      ) : section === 'tui' ? (
        <InterfaceSettings workspace={w} />
      ) : ['attachments', 'assistants', 'connectors', 'skills'].includes(section) ? (
        <WorkspaceSettings key={section} section={section} workspace={w} />
      ) : section === 'shortcuts' ? (
        <section className="settings-card">
          <dl className="settings-shortcuts">
            {[
              ['Server', 'Alt+1'],
              ['Models', 'Alt+2'],
              ['Settings', 'Alt+3'],
              ['Playground', 'Alt+4'],
              ['Move focus', 'Tab / Shift+Tab'],
              ['Activate', 'Enter'],
              ['Close dialog', 'Escape'],
              ['Help', 'F1'],
              ['Commands', 'F4'],
            ].map(([label, keys]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : section === 'hardware' ? (
        <HardwareSettings workspace={w} />
      ) : section === 'api' ? (
        <ServerConfiguration workspace={w} />
      ) : section !== 'diagnostics' ? (
        <RuntimeSettings workspace={w} section={section} />
      ) : (
        <>
          <Panel title="Diagnostics">
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
          </Panel>
          <Panel title="Server health">
            <p>
              {w.snapshot?.errors.length
                ? `${w.snapshot.errors.length} recent errors`
                : 'No recent errors reported.'}
            </p>
            <details>
              <summary>Technical report</summary>
              <JsonResult value={{ core: w.snapshot?.core, errors: w.snapshot?.errors }} />
            </details>
          </Panel>
        </>
      )}
      {section === 'engines' && (
        <Panel title="Engine configuration">
          <Action onClick={openEngines}>Manage engines and model settings</Action>
        </Panel>
      )}
    </div>
  )
}
