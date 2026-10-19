import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { runHostStepHelper } from './helper.js'

describe('host-step helper', () => {
  it('runs the core executor on the request and returns its result', async () => {
    const seen: string[] = []
    const result = await runHostStepHelper('/x/s1.request.json', {
      platform: 'linux',
      env: {},
      execute: async (path) => {
        seen.push(path)
        return {
          schema_version: 1,
          step_id: 's1',
          outcome: 'completed',
          exit_code: 0,
          log_tail: '',
          finished_at: 9,
        } as never
      },
    })
    expect(seen).toEqual(['/x/s1.request.json'])
    expect(result).toMatchObject({ step_id: 's1', outcome: 'completed' })
  })

  it('turns a request it cannot even answer (an untrusted folder) into a usage error', async () => {
    await expect(
      runHostStepHelper('/x/s1.request.json', {
        platform: 'linux',
        env: {},
        execute: async () => {
          throw new AtomicCoreError(
            'MANAGED_HOST_STEP_INVALID',
            '/x is owned by uid 501; only uid 0 is trusted here'
          )
        },
      })
    ).rejects.toMatchObject({ code: 'ATC_USAGE', hint: expect.stringContaining('sudo') })
  })
})
