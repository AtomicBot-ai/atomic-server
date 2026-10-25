import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { waitFor } from '../../../test/helpers/wait-for.js'
import { FoundryAccelerators, preparable } from './foundry.js'

const probe = (
  accelerators: Array<{ name: string; execution_provider: string | null; device: string; prepared: boolean }>
) => ({
  installed: true,
  build: 'v2.1.0/win-x64',
  version: '2.1.0',
  c_api_version: 1,
  probed_at: 1,
  accelerators,
  error: null,
})
const NPU = {
  name: 'OpenVINOExecutionProvider',
  execution_provider: 'openvino',
  device: 'gpu/npu',
  prepared: false,
}
const RTX = {
  name: 'NvTensorRTRTXExecutionProvider',
  execution_provider: null,
  device: 'gpu',
  prepared: false,
}
const CPU = { name: 'CPUExecutionProvider', execution_provider: 'cpu', device: 'cpu', prepared: true }

describe('FoundryAccelerators', () => {
  it('reads the probe, a refresh asking the library again', async () => {
    const l = fakeCoreLink()
    l.responses['GET /runtimes/foundry-local/accelerators'] = probe([NPU, CPU])
    l.responses['GET /runtimes/foundry-local/accelerators?force=1'] = probe([{ ...NPU, prepared: true }, CPU])
    const f = new FoundryAccelerators(l)
    expect(await f.status(false)).toMatchObject({ preparing: false, accelerators: [NPU, CPU] })
    expect((await f.status(true)).accelerators[0]?.prepared).toBe(true)
  })

  it('prepares in the background, joining a prepare already running, and keeps its summary', async () => {
    const l = fakeCoreLink()
    l.responses['GET /runtimes/foundry-local/accelerators'] = probe([NPU, CPU])
    let finish: (v: unknown) => void = () => {}
    let posts = 0
    l.responses['POST /runtimes/foundry-local/accelerators/prepare'] = () => {
      posts += 1
      return new Promise((resolve) => (finish = resolve))
    }
    const f = new FoundryAccelerators(l)
    expect(await f.prepare(['OpenVINOExecutionProvider'])).toMatchObject({ preparing: true })
    expect(await f.prepare(['OpenVINOExecutionProvider'])).toMatchObject({ preparing: true })
    expect(posts).toBe(1)
    expect(l.calls.find((c) => c.path.endsWith('/prepare'))?.body).toEqual({
      accelerators: ['OpenVINOExecutionProvider'],
    })
    finish({ accelerators: [{ name: 'OpenVINOExecutionProvider', prepared: true }] })
    await waitFor(async () => !(await f.status(false)).preparing)
    expect((await f.status(false)).last_result).toEqual({
      accelerators: [{ name: 'OpenVINOExecutionProvider', prepared: true }],
    })
  })

  it('waits for a prepare another client runs instead of failing', async () => {
    const l = fakeCoreLink()
    l.responses['GET /runtimes/foundry-local/accelerators'] = probe([NPU])
    let posts = 0
    l.responses['POST /runtimes/foundry-local/accelerators/prepare'] = () =>
      ++posts < 3
        ? new AtomicCoreError('ENGINE_INSTALL_IN_PROGRESS', 'A prepare is running.')
        : { accelerators: [{ name: 'OpenVINOExecutionProvider', prepared: true }] }
    const f = new FoundryAccelerators(l, { retryMs: 1 })
    await f.prepare()
    await waitFor(async () => !(await f.status(false)).preparing)
    expect(posts).toBe(3)
    expect((await f.status(false)).last_error).toBeNull()
  })

  it('says Foundry Local does not run here when the core does not register it', async () => {
    const l = fakeCoreLink()
    l.responses['GET /runtimes/foundry-local/accelerators'] = new AtomicCoreError(
      'PROVIDER_NOT_FOUND',
      'Foundry Local does not run on this computer.'
    )
    await expect(new FoundryAccelerators(l).status(false)).rejects.toThrow('not available on this platform')
  })
})

describe('prepare progress', () => {
  it('keeps the latest step of each accelerator while a prepare runs, and starts over with the next', async () => {
    const l = fakeCoreLink()
    l.responses['GET /runtimes/foundry-local/accelerators'] = probe([NPU, CPU])
    let finish: (v: unknown) => void = () => {}
    l.responses['POST /runtimes/foundry-local/accelerators/prepare'] = () =>
      new Promise((resolve) => (finish = resolve))
    const f = new FoundryAccelerators(l)
    await f.prepare()
    const step = (stage: string, fraction: number | null) =>
      f.event('foundry-local:accelerators', { accelerator: NPU.name, stage, fraction })
    step('started', 0)
    step('downloading', 0.4)
    f.event('session:started', { provider: 'vllm', model_id: 'x' })
    expect((await f.status(false)).steps).toEqual([
      { accelerator: NPU.name, stage: 'downloading', fraction: 0.4 },
    ])
    finish({ accelerators: [{ name: NPU.name, prepared: true }] })
    await waitFor(async () => !(await f.status(false)).preparing)
    await f.prepare()
    expect((await f.status(false)).steps).toEqual([])
  })
})

describe('preparable', () => {
  it('offers only the unprepared accelerators that have an execution provider', () => {
    expect(preparable(probe([NPU, RTX, CPU]) as never).map((a) => a.name)).toEqual([
      'OpenVINOExecutionProvider',
    ])
  })
})
