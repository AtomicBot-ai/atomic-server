// Lifted from atomic-chat-ui/web-app/src/routes/settings/interface.tsx @ 807b4d9; adapted: browser appearance and server terminal settings.
import { useThemeStore } from '@/hooks/useTheme'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { RuntimeSettings } from './RuntimeSettings'
import './interface-settings.css'

export function InterfaceSettings({ workspace }: { workspace: Workspace }) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  return (
    <>
      <section className="settings-card" aria-label="Interface appearance">
        <div className="settings-item">
          <label htmlFor="interface-theme">
            <strong>Theme</strong>
            <small>Appearance in this browser.</small>
          </label>
          <div className="settings-item-control">
            <select
              id="interface-theme"
              aria-label="Theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="settings-item">
          <label>
            <strong>Font size</strong>
            <small>Use your browser’s zoom controls.</small>
          </label>
          <span>Browser default</span>
        </div>
        <div className="settings-item">
          <label>
            <strong>Reset to default</strong>
          </label>
          <Action danger onClick={() => setTheme('dark')}>
            Reset
          </Action>
        </div>
      </section>
      <details className="settings-card settings-advanced">
        <summary>Terminal interface</summary>
        <RuntimeSettings workspace={workspace} section="tui" />
      </details>
    </>
  )
}
