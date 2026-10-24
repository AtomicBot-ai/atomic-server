import type { ActionContext } from '../actions.js'
import { record } from '../library/library-model.js'
export async function remoteAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (!['remote-refresh', 'remote-toggle', 'lan-toggle', 'remote-copy'].includes(id)) return false
  const s = ctx.get(),
    c = ctx.controller
  if (id === 'remote-copy') {
    if (typeof s.remote['url'] === 'string') ctx.copy(`${s.remote['url']}${s.workspace?.api.prefix ?? '/v1'}`)
    return true
  }
  if (s.busy) return true
  ctx.update((v) => ({ ...v, busy: true, message: '' }))
  try {
    if (id === 'remote-toggle') {
      if (!s.remote['canStart'] && !s.remote['canStop'])
        throw new Error('Start the API before remote access.')
      if (!s.remote['canStop'] && !s.workspace?.keys.length)
        await c.runtime.execute('keys.create', { name: 'Remote clients' })
      await c.runtime.execute(
        s.remote['canStop'] ? 'remote.stop' : 'remote.start',
        s.remote['canStop'] ? {} : { request: {} }
      )
    } else if (id === 'lan-toggle') {
      const lan = s.workspace?.api.running && s.workspace.api.host === '0.0.0.0'
      if (!lan && !s.workspace?.keys.length)
        await c.runtime.execute('keys.create', { name: 'Network clients' })
      const host = lan ? '127.0.0.1' : '0.0.0.0'
      await c.runtime.execute('config.update', { values: { 'api.host': host } })
      await c.runtime.execute(s.workspace?.api.running ? 'api.restart' : 'api.start', { request: { host } })
    }
    const [status, addresses] = await Promise.all([
      c.runtime.execute('remote.status'),
      c.runtime.execute('remote.addresses'),
    ])
    ctx.update((v) => ({
      ...v,
      remote: { ...record(status), addresses: record(addresses)['addresses'] },
      workspace: v.workspace,
    }))
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
  return true
}
