import type { RemoteSetupView } from '@view'
import { Copy } from '../Controls'

/** How to install `cloudflared` on the server's machine, then restart the server: the terminal UI's steps. */
export function RemoteSetup({ setup }: { setup: RemoteSetupView }) {
  const commands = setup.commands.join('\n')
  return (
    <div className="remote-setup">
      <p>{setup.intro}</p>
      {commands ? (
        <div className="connect-address">
          <pre>
            <code>{commands}</code>
          </pre>
          <Copy value={commands} label="Copy install commands" />
        </div>
      ) : (
        !setup.found && (
          <a href={setup.url} target="_blank" rel="noreferrer">
            {setup.url}
          </a>
        )
      )}
      {setup.restart && (
        <>
          <p>Then restart the server:</p>
          <div className="connect-address">
            <code>{setup.restart}</code>
            <Copy value={setup.restart} label="Copy restart command" />
          </div>
        </>
      )}
    </div>
  )
}
