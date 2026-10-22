import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { LiteRtAccelerators } from './litert.js'

const OPENVINO = {
  name: 'openvino',
  device: 'npu',
  version: '2026.4.1',
  size_bytes: 85_000_000,
  prepared: false,
}
const listing = (accelerators: unknown[], npu: string | null = 'intel-lnl') => ({
  installed: true,
  build: '0.18.1/win-x64',
  npu,
  accelerators,
  error: null,
})
const ROUTE = '/runtimes/litert-lm/accelerators'

describe('LiteRtAccelerators', () => {
  it('reads what the core offers this machine', async () => {
    const l = fakeCoreLink()
    l.responses[`GET ${ROUTE}`] = listing([OPENVINO])
    const a = new LiteRtAccelerators(l)
    expect(await a.status()).toMatchObject({ preparing: false, npu: 'intel-lnl', accelerators: [OPENVINO] })
  })

  it('prepares in the background with atc’s proxy, joining a prepare already running', async () => {
    const l = fakeCoreLink()
    l.responses[`GET ${ROUTE}`] = listing([OPENVINO])
    let finish: (v: unknown) => void = () => {}
    let posts = 0
    l.responses[`POST ${ROUTE}/prepare`] = () => {
      posts += 1
      return new Promise((resolve) => (finish = resolve))
    }
    const proxy = { url: 'http://proxy.test:3128' }
    const a = new LiteRtAccelerators(l, { proxy: () => proxy as never })
    expect(await a.prepare(['openvino'])).toMatchObject({ preparing: true })
    expect(await a.prepare()).toMatchObject({ preparing: true })
    expect(posts).toBe(1)
    await waitFor(async () => l.calls.some((c) => c.path.endsWith('/prepare')))
    expect(l.calls.find((c) => c.path.endsWith('/prepare'))?.body).toEqual({
      accelerators: ['openvino'],
      proxy,
    })
    a.event('litert-lm:accelerators', { accelerator: 'openvino', stage: 'downloading', fraction: 0.5 })
    a.event('foundry-local:accelerators', { accelerator: 'other', stage: 'downloading', fraction: 0.5 })
    expect((await a.status()).steps).toEqual([
      { accelerator: 'openvino', stage: 'downloading', fraction: 0.5 },
    ])
    finish({ accelerators: [{ name: 'openvino', prepared: true }] })
    await waitFor(async () => !(await a.status()).preparing)
    expect((await a.status()).last_result).toEqual({ accelerators: [{ name: 'openvino', prepared: true }] })
  })

  it('waits out a prepare another client runs', async () => {
    const l = fakeCoreLink()
    let posts = 0
    l.responses[`POST ${ROUTE}/prepare`] = () =>
      ++posts < 2
        ? new AtomicCoreError('ENGINE_INSTALL_IN_PROGRESS', 'busy')
        : { accelerators: [{ name: 'openvino', prepared: true }] }
    const a = new LiteRtAccelerators(l, { retryMs: 1 })
    await a.prepare()
    await waitFor(async () => !(await a.status()).preparing)
    expect(posts).toBe(2)
    expect((await a.status()).last_error).toBeNull()
  })

  it('says LiteRT-LM is not available where the core does not register it', async () => {
    const l = fakeCoreLink()
    l.responses[`GET ${ROUTE}`] = new AtomicCoreError(
      'PROVIDER_NOT_FOUND',
      'LiteRT-LM does not run on this computer.'
    )
    await expect(new LiteRtAccelerators(l).status()).rejects.toThrow(
      'LiteRT-LM is not available on this platform'
    )
  })
})
