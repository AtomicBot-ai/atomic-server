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
