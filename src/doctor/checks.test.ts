import { describe, expect, it } from 'vitest'
import { CHECKS, runChecks, worstStatus } from './checks.js'
import type { Check } from './checks.js'

describe('runChecks', () => {
  it('runs every check, catches throws, and summarises', async () => {
    const checks: Check[] = [
      { id: 'a', title: 'A', run: async () => ({ status: 'ok', message: 'fine' }) },
      { id: 'b', title: 'B', run: async () => ({ status: 'warn', message: 'meh' }) },
      {
        id: 'c',
        title: 'C',
        run: async () => {
          throw new Error('boom')
        },
      },
    ]
    const results = await runChecks(checks, {} as never)
    expect(results.map((r) => r.status)).toEqual(['ok', 'warn', 'fail'])
    expect(results[2]?.message).toBe('boom')
    expect(worstStatus(results)).toBe('fail')
    expect(worstStatus(results.slice(0, 2))).toBe('warn')
    expect(worstStatus(results.slice(0, 1))).toBe('ok')
  })
})

describe('install check', () => {
  it.each([
    [{ path: '/usr/bin/atc', kind: 'deb' }, '/usr/bin/atc (the deb package)'],
    [{ path: '/home/u/.local/bin/atc', kind: 'release' }, '/home/u/.local/bin/atc (a release binary)'],
  ] as const)('reports %o', async (install, message) => {
    const check = CHECKS.find((c) => c.id === 'install')!
    expect(await check.run({ install } as never)).toEqual({ status: 'ok', message })
  })
})

describe('gpu check', () => {
  const gpu = (name: string, vendor: string, driver: string) => ({
    name,
    vendor,
    driver_version: driver,
    total_memory: 8192,
    uuid: '',
    nvidia_info: null,
    vulkan_info: null,
  })
  const info = (gpus: ReturnType<typeof gpu>[], warnings: string[] = []) => ({
    info: { gpus } as never,
    source: 'probe' as const,
    probed_at: 0,
    warnings,
  })
  // The core is the only source of hardware facts; the check never measures the machine itself.
  const host = new Proxy({}, { get: () => () => expect.fail('the gpu check must not probe the host') })
  const run = (hardware: () => Promise<ReturnType<typeof info> | undefined>) =>
    CHECKS.find((c) => c.id === 'gpu')!.run({ host, hardware } as never)

  it.each([
    [
      'what the core detected, any vendor',
      info([gpu('Radeon RX 7900', 'AMD', ''), gpu('RTX 4090', 'NVIDIA', '581.42')]),
      { status: 'ok', message: 'Radeon RX 7900 (AMD); RTX 4090 (NVIDIA, driver 581.42)' },
    ],
    ['no GPU', info([]), { status: 'ok', message: 'the core lists no GPU' }],
    [
      'what the probe could not read',
      info([], ['vulkaninfo not found']),
      {
        status: 'warn',
        message: 'the core lists no GPU',
        hint: 'vulkaninfo not found',
      },
    ],
  ] as const)('reports %s', async (_name, answer, expected) => {
    expect(await run(async () => answer)).toEqual(expected)
  })

  // A server of another build (after `atc update`) or a foreign owner: doctor still finishes.
  it('warns when the server cannot answer', async () => {
    expect(
      await run(async () => {
        throw new Error('The running server is from another build.')
      })
    ).toEqual({
      status: 'warn',
      message: 'could not ask the server: The running server is from another build.',
    })
  })

  it('skips without a running server', async () => {
    expect(await run(async () => undefined)).toEqual({
      status: 'skip',
      message: 'the server is not running; start it to see what the core detected',
    })
  })
})
