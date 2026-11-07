// Lifted from atomic-chat-ui/web-app/src/routes/settings/interface.tsx @ 807b4d9; adapted: browser appearance and server terminal settings.
import { useThemeStore } from '@/hooks/useTheme'
import type { Workspace } from '../../useWorkspace'
import { Action } from '../../Controls'
import { SettingsField, SettingsSection } from '../../SettingsForm'
import { RuntimeSettings } from './RuntimeSettings'
import './interface-settings.css'

export function InterfaceSettings({ workspace }: { workspace: Workspace }) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  return (
    <>
      <SettingsSection title="Appearance" description="Changes apply immediately in this browser.">
        <SettingsField label="Theme" hint="Choose the appearance of the web interface.">
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </SettingsField>
        <div className="settings-item">
          <div>
            <strong>Font size</strong>
            <small>Use your browser’s zoom controls.</small>
          </div>
          <span>Browser default</span>
        </div>
        <div className="settings-item">
          <div>
            <strong>Reset to default</strong>
          </div>
          <Action onClick={() => setTheme('dark')}>Reset</Action>
        </div>
      </SettingsSection>
      <details className="settings-card settings-advanced">
        <summary>Terminal interface</summary>
        <RuntimeSettings workspace={workspace} section="tui" />
      </details>
    </>
  )
}
