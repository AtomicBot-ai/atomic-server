import { expect, it, vi } from 'vitest'
import { flmPreparationAction } from './fastflowlm-actions.js'

it('hands the terminal to authorization after consent, without asking for a manual command', async () => {
  const hostStep = vi.fn()
  const execute = vi.fn(async () => ({ operation_id: 'memory', state: 'preparing-host' }))
  const ctx = {
    hostStep,
    get: () => ({
      enginePanel: {
        engine: 'fastflowlm',
        fastflowlm: {
          operation: { operation_id: 'memory', revision: 2, plan: { plan_digest: 'sha256:approved' } },
        },
      },
    }),
    update: vi.fn(),
    controller: { runtime: { execute } },
  }
  await flmPreparationAction('flm-consent', ctx as never)
  expect(hostStep).toHaveBeenCalledExactlyOnceWith('memory')
  expect(execute).toHaveBeenCalledTimes(1)
})

it('rechecks manual setup without creating an operation or requesting rights', async () => {
  const execute = vi.fn(async (name: string) => (name === 'fastflowlm.probe' ? { status: 'ready' } : []))
  const hostStep = vi.fn()
  const ctx = {
    hostStep,
    get: () => ({ enginePanel: { engine: 'fastflowlm' } }),
    update: vi.fn(),
    controller: { runtime: { execute } },
  }
  expect(await flmPreparationAction('flm-refresh', ctx as never)).toBe(true)
  expect(execute.mock.calls.map(([name]) => name)).toEqual([
    'fastflowlm.probe',
    'fastflowlm.operations',
    'fastflowlm.host-steps',
  ])
  expect(hostStep).not.toHaveBeenCalled()
})
