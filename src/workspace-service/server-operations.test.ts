import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../config/index.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { serverOperation } from './server-operations.js'
import { NOT_CORE } from './not-core.js'

function parts(over: Record<string, unknown> = {}) {
  const link = fakeCoreLink()
  const keys = {
    get: vi.fn(async (id?: string) => (id === 'missing' ? '' : 'key-1')),
    list: vi.fn(async () => [{ id: 'k1', name: 'one' }]),
    create: vi.fn(async (name: string) => ({ id: 'k2', name })),
    revoke: vi.fn(async () => undefined),
  }
  const metrics = { setDetailed: vi.fn() }
  const options = {
    link,
    config: defaultConfig(),
    paths: { dataFolder: "/data/it's", atcDir: '/data/atc', daemonLog: '/nope/daemon.log' },
    selfCommand: ['/usr/bin/atc'],
  }
  return {
    link,
    keys,
    metrics,
    parts: { options, keys, metrics, request: fetch, snapshot: async () => ({}), ...over } as never,
  }
}

describe('server operations', () => {
  it('names the command prefix a person copies, quoted for the shell', async () => {
    expect(await serverOperation(parts().parts, 'config.get', {})).toMatchObject({
      command_prefix: `'/usr/bin/atc' --data-folder '/data/it'\\''s'`,
    })
  })

  it('starts the API with the configured listener and the server key, stopping it first on restart', async () => {
    const { link, parts: p } = parts()
    const stop = vi.spyOn(link.server, 'stop')
    await serverOperation(p, 'api.restart', { request: { port: 9999 } })
    expect(stop).toHaveBeenCalled()
    expect(link.calls.find((c) => c.path === '/server/start')?.body).toMatchObject({
      port: 9999,
      api_key: 'key-1',
      fallback_port: false,
    })
  })

  it('turns request details on and off with the inspector', async () => {
    const { metrics, parts: p } = parts()
    await serverOperation(p, 'api.inspector', { enabled: true })
    expect(metrics.setDetailed).toHaveBeenCalledWith(true)
  })

  it('creates, reveals and revokes keys, refusing one it does not know', async () => {
    const { keys, parts: p } = parts()
    expect(await serverOperation(p, 'keys.create', { name: 'ci' })).toEqual({ id: 'k2', name: 'ci' })
    expect(await serverOperation(p, 'keys.reveal', { id: 'k1' })).toEqual({ key: 'key-1' })
    await expect(serverOperation(p, 'keys.reveal', { id: 'missing' })).rejects.toMatchObject({
      code: 'ATC_USAGE',
    })
    await expect(serverOperation(p, 'keys.revoke', { id: 'nope' })).rejects.toThrow('No such API key.')
    expect(await serverOperation(p, 'keys.revoke', { id: 'k1' })).toEqual({ revoked: true })
    expect(keys.revoke).toHaveBeenCalledWith('k1')
  })

  it('refuses an agent profile while the API is stopped', async () => {
    await expect(
      serverOperation(parts().parts, 'connection.profile', { agent: 'codex', model: 'm' })
    ).rejects.toThrow('Start the API before connecting an agent.')
  })

  it('refuses to finish guided setup without a running API and a loaded model', async () => {
    const snapshot = async () => ({ api: { running: false }, services: [] })
    await expect(serverOperation(parts({ snapshot }).parts, 'setup.complete', {})).rejects.toThrow(
      'Start the API and load a model'
    )
  })

  it('reads the log of a server that has written none as empty', async () => {
    expect(await serverOperation(parts().parts, 'logs.read', { lines: 5 })).toEqual({ lines: [''] })
  })

  it('leaves any other operation to the next owner', async () => {
    expect(await serverOperation(parts().parts, 'history.list', {})).toBe(NOT_CORE)
  })
})
