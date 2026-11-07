// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Setup.tsx @ 5043013; adapted: endpoint fields extracted from ConnectionGuide with shared layout and inline validation.
import { SettingsField, SettingsSection } from '../../SettingsForm'

export function ConnectionEndpoint({
  host,
  port,
  valid,
  setPort,
}: {
  host?: string
  port: string
  valid: boolean
  setPort: (value: string) => void
}) {
  return (
    <SettingsSection
      title="API endpoint"
      description="Enable network access later from Server configuration."
    >
      <SettingsField label="Access">
        <input
          readOnly
          value={host && host !== '127.0.0.1' ? `Local network · ${host}` : 'This device only · 127.0.0.1'}
        />
      </SettingsField>
      <div className="connection-port">
        <SettingsField label="Server port" error={valid ? undefined : 'Choose a port between 1 and 65535.'}>
          <input
            inputMode="numeric"
            value={port}
            aria-invalid={!valid}
            onChange={(e) => setPort(e.target.value)}
          />
        </SettingsField>
      </div>
    </SettingsSection>
  )
}
