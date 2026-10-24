import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Panel } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
export function RemoteAccess({ workspace: w }: { workspace: Workspace }) {
  const [addresses, setAddresses] = useState<string[]>([])
  const [remote, setRemote] = useState<RecordValue>({})
  const [error, setError] = useState('')
  const lan = w.snapshot?.api.running && !['127.0.0.1', 'localhost', '::1'].includes(w.snapshot.api.host)
  const { execute } = w
  useEffect(() => {
    let live = true,
      pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const [r, a] = await Promise.all([execute('remote.status'), execute('remote.addresses')])
        if (live) {
          setRemote(record(r))
          setAddresses(Array.isArray(record(a).addresses) ? (record(a).addresses as string[]) : [])
          setError('')
        }
      } catch (e) {
        if (live) setError(String(e))
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 2500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [execute])
  return (
    <>
      <Panel title="Public remote access">
        <p>Reach this server over HTTPS through a Cloudflare tunnel.</p>
        <p role="status">{text(remote.state, 'Checking status…')}</p>
        {error && <p role="alert">{error}</p>}
        {Boolean(remote.error) && <p role="alert">{text(remote.error).replaceAll('_', ' ')}</p>}
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
      </Panel>
      <Panel title="Local network">
        <p>Let devices on the same network connect with an API key.</p>
        <p role="status">{lan ? 'Connected' : 'Stopped'}</p>
        <Action
          primary
          onClick={async () => {
            if (!lan && !w.snapshot?.keys.length) await execute('keys.create', { name: 'Network clients' })
            const host = lan ? '127.0.0.1' : '0.0.0.0'
            await execute('config.update', { values: { 'api.host': host } })
            await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', { request: { host } })
            await w.refresh()
          }}
        >
          {lan ? 'Stop local network' : 'Start local network'}
        </Action>
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
      </Panel>
    </>
  )
}
