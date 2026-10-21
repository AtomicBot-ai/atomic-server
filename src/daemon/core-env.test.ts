import { describe, expect, it } from 'vitest'
import { coreEnv } from './core-env.js'

describe('coreEnv', () => {
  it.each([
    ['Linux: Foundry Local’s 1DS upload off', 'linux', {}, 'True'],
    ['Linux, already set by the person: as it is', 'linux', { TF_BUILD: 'False' }, 'False'],
    ['Windows: unchanged', 'win32', {}, undefined],
    ['macOS: unchanged', 'darwin', {}, undefined],
  ] as const)('%s', (_name, platform, env, tfBuild) => {
    const result = coreEnv({ PATH: '/usr/bin', ...env }, platform)
    expect(result['TF_BUILD']).toBe(tfBuild)
    expect(result['PATH']).toBe('/usr/bin')
  })

  it('leaves the server’s own environment alone', () => {
    const env: Record<string, string | undefined> = { PATH: '/usr/bin' }
    coreEnv(env, 'linux')
    expect(env).toEqual({ PATH: '/usr/bin' })
  })
})
