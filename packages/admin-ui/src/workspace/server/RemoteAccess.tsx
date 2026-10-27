import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Panel } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { sharedRead, watchSharedRead } from '../watch-shared-read'
export function RemoteAccess({ workspace: w }: { workspace: Workspace }) {
  const [addresses, setAddresses] = useState<string[]>([])
  const [remote, setRemote] = useState<RecordValue>({})
  const [error, setError] = useState('')
  const lan = w.snapshot?.api.running && !['127.0.0.1', 'localhost', '::1'].includes(w.snapshot.api.host)
  const { execute } = w
  useEffect(
    () =>
      watchSharedRead(
        () => Promise.all([sharedRead(execute, 'remote.status'), sharedRead(execute, 'remote.addresses')]),
        ([r, a]) => {
          setRemote(record(r))
          setAddresses(Array.isArray(record(a).addresses) ? (record(a).addresses as string[]) : [])
          setError('')
        },
        (e) => setError(describeError(e))
      ),
    [execute]
  )
  return (
    <>
      <Panel title="Public remote access">
        <div className="remote-access-body">
          <p>Reach this server over HTTPS through a Cloudflare tunnel.</p>
          <p role="status">{text(remote.state, 'Checking status…')}</p>
          {error && <p role="alert">{error}</p>}
          {Boolean(remote.error) && <p role="alert">{text(remote.error).replaceAll('_', ' ')}</p>}
          <div className="remote-access-actions">
            {remote.blockReason === 'server_stopped' && (
              <Action onClick={() => execute('api.start')}>Start server</Action>
            )}
            <Action
              primary
              disabled={!remote.canStart && !remote.canStop}
              onClick={async () => {
                if (!remote.canStop && !w.snapshot?.keys.length)
                  await execute('keys.create', { name: 'Remote clients' })
                setRemote(
                  record(
                    await execute(
                      remote.canStop ? 'remote.stop' : 'remote.start',
                      remote.canStop ? {} : { request: {} }
                    )
                  )
                )
              }}
            >
              {remote.canStop ? 'Stop remote access' : 'Start remote access'}
            </Action>
          </div>
          {remote.state === 'online' && Boolean(remote.url) && (
            <div className="connect-address">
              <code>
                {text(remote.url)}
                {w.snapshot?.api.prefix}
              </code>
              <Copy
                value={`${text(remote.url)}${w.snapshot?.api.prefix ?? '/v1'}`}
                label="Copy remote address"
              />
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Local network">
        <div className="remote-access-body">
          <p>Let devices on the same network connect with an API key.</p>
          <p role="status">{localNetworkStatus(w.snapshot?.api)}</p>
          <div className="remote-access-actions">
            <Action
              primary
              onClick={async () => {
                if (!lan && !w.snapshot?.keys.length)
                  await execute('keys.create', { name: 'Network clients' })
                const host = lan ? '127.0.0.1' : '0.0.0.0'
                await execute('config.update', { values: { 'api.host': host } })
                await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', { request: { host } })
                await w.refresh()
              }}
            >
              {lan ? 'Stop local network' : 'Start local network'}
            </Action>
          </div>
          {lan &&
            addresses.map((a) => {
              const url = `http://${a}:${w.snapshot?.api.port}${w.snapshot?.api.prefix}`
              return (
                <div key={a} className="connect-address">
                  <code>{url}</code>
                  <Copy value={url} label="Copy address" />
                </div>
              )
            })}
        </div>
      </Panel>
    </>
  )
}

/** The API's address is what "local network" means: loopback keeps other devices out; down is Stopped. */
function localNetworkStatus(api: { running: boolean; host: string; port: number } | undefined): string {
  if (!api?.running) return 'Stopped: the API is not running'
  const address = `${api.host}:${api.port}`
  return ['127.0.0.1', 'localhost', '::1'].includes(api.host)
    ? `Local only (${address}): other devices cannot reach it`
    : `Listening on ${address} for devices on this network`
}
