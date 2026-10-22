/** LiteRT-LM's engine and accelerator from `atc engines` (spec litert-lm-server, "Движок и ускоритель LiteRT-LM в atc"). */
import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

const ROUTE = '/runtimes/litert-lm/accelerators'
const OPENVINO = { name: 'openvino', device: 'npu', version: '2026.4.1', size_bytes: 85_000_000 }
const listing = (accelerators: unknown[], npu: string | null) => ({
  installed: true,
  build: '0.18.1/win-x64',
  npu,
  accelerators,
  error: null,
})
const versions = { engines: [{ engine: 'litert-lm', kind: 'engine-build', builds: [], active: null }] }
const installed = { updated: true, active: { version: '0.18.1', variant: 'win-x64' } }

/** A Windows host with a Lunar Lake NPU: the prepare reports its steps, then openvino is prepared. */
function windowsNpu() {
  t = testRun()
  let prepared = false
  t.link.responses['POST /engines/versions'] = versions
  t.link.responses['POST /engines/litert-lm/update'] = installed
  t.link.responses[`GET ${ROUTE}`] = () => listing([{ ...OPENVINO, prepared }], 'intel-lnl')
  t.link.responses[`POST ${ROUTE}/prepare`] = async () => {
    for (const [stage, fraction] of [
      ['started', null],
      ['downloading', 0.5],
      ['done', null],
    ] as const) {
      await new Promise((r) => setTimeout(r, 5))
      t.link.emit({
        id: `l:${stage}`,
        event: 'litert-lm:accelerators',
        data: { accelerator: 'openvino', stage, fraction },
      })
    }
    prepared = true
    return { accelerators: [{ name: 'openvino', prepared: true }] }
  }
}

/** A Linux host: the core offers no accelerator. */
function linux() {
  t = testRun()
  t.link.responses['POST /engines/versions'] = versions
  t.link.responses['POST /engines/litert-lm/update'] = {
    ...installed,
    active: { version: '0.18.1', variant: 'linux-x64' },
  }
  t.link.responses[`GET ${ROUTE}`] = { ...listing([], null), build: '0.18.1/linux-x64' }
}

const prepares = () => t.link.calls.filter((c) => c.path === `${ROUTE}/prepare`)

describe('atc engines install litert-lm', () => {
  it('installs the build and prepares openvino after it on a host with an Intel NPU', async () => {
    windowsNpu()
    expect(await t.run(['engines', 'install', 'litert-lm'])).toBe(0)
    expect(t.link.calls.some((c) => c.path === '/engines/litert-lm/update')).toBe(true)
    expect(prepares().map((c) => c.body)).toEqual([{ accelerators: ['openvino'] }])
    expect(err()).toContain('openvino: downloading')
    expect(out()).toContain('openvino: prepared')
  })

  it('skips the prepare with --no-accelerators', async () => {
    windowsNpu()
    expect(await t.run(['engines', 'install', 'litert-lm', '--no-accelerators'])).toBe(0)
    expect(t.link.calls.some((c) => c.path === '/engines/litert-lm/update')).toBe(true)
    expect(prepares()).toEqual([])
  })

  it('prepares nothing on Linux, where the core offers no accelerator', async () => {
    linux()
    expect(await t.run(['engines', 'install', 'litert-lm'])).toBe(0)
    expect(t.link.calls.some((c) => c.path === '/engines/litert-lm/update')).toBe(true)
    expect(prepares()).toEqual([])
    expect(out()).not.toMatch(/prepar/i)
  })

  it('says LiteRT-LM is not available where the core does not offer it, and installs nothing', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = { engines: [] }
    expect(await t.run(['engines', 'install', 'litert-lm'])).toBe(2)
    expect(err()).toContain('litert-lm is not available on this platform')
    expect(t.link.calls.some((c) => c.path.endsWith('/update'))).toBe(false)
  })
})

describe('atc engines accelerators litert-lm', () => {
  it('lists openvino with its version, size and whether it is prepared', async () => {
    windowsNpu()
    expect(await t.run(['engines', 'accelerators', 'litert-lm'])).toBe(0)
    expect(out()).toMatch(/openvino\s+npu\s+2026\.4\.1\s+81\.1 MiB\s+no/)
    expect(out()).toContain('intel-lnl')
  })

  it('asks the core again with --refresh', async () => {
    windowsNpu()
    expect(await t.run(['engines', 'accelerators', 'litert-lm', '--refresh'])).toBe(0)
    expect(t.link.calls.filter((c) => c.path === ROUTE).length).toBeGreaterThan(0)
  })

  it('prepares openvino with --prepare, showing its progress', async () => {
    windowsNpu()
    expect(await t.run(['engines', 'accelerators', 'litert-lm', '--prepare'])).toBe(0)
    expect(prepares().map((c) => c.body)).toEqual([{ accelerators: ['openvino'] }])
    expect(err()).toContain('openvino: downloading')
    expect(out()).toContain('openvino: prepared')
  })

  it('follows a prepare another client runs instead of failing', async () => {
    windowsNpu()
    const real = t.link.responses[`POST ${ROUTE}/prepare`] as () => Promise<unknown>
    let calls = 0
    t.link.responses[`POST ${ROUTE}/prepare`] = () =>
      ++calls < 2 ? new AtomicCoreError('ENGINE_INSTALL_IN_PROGRESS', 'A prepare is running.') : real()
    expect(await t.run(['engines', 'accelerators', 'litert-lm', '--prepare'])).toBe(0)
    expect(prepares().length).toBeGreaterThan(1)
    expect(out()).toContain('openvino: prepared')
  })

  it('says nothing needs preparing on a host without an Intel NPU', async () => {
    linux()
    expect(await t.run(['engines', 'accelerators', 'litert-lm', '--prepare'])).toBe(0)
    expect(out()).toContain('nothing to prepare')
    expect(prepares()).toEqual([])
  })

  it('says LiteRT-LM is not available where the core does not register it', async () => {
    t = testRun()
    t.link.responses[`GET ${ROUTE}`] = new AtomicCoreError(
      'PROVIDER_NOT_FOUND',
      'LiteRT-LM does not run on this computer.'
    )
    expect(await t.run(['engines', 'accelerators', 'litert-lm'])).toBe(2)
    expect(err()).toContain('LiteRT-LM is not available on this platform')
  })
})
