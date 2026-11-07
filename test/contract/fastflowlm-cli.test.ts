import { afterEach, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})
it('prints FastFlowLM accelerator facts as one JSON document', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['GET /runtimes/fastflowlm/accelerators'] = {
    ready: false,
    reason: 'driver-missing',
    devices: [],
    blockers: ['driver-missing'],
  }
  expect(await t.run(['engines', 'accelerators', 'fastflowlm', '--json'])).toBe(0)
  expect(t.io.out.join('')).toContain('driver-missing')
  expect(() => JSON.parse(t.io.out.join(''))).not.toThrow()
})
it('refuses an unavailable automatic recipe without asking for elevation or claiming readiness', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['POST /runtimes/fastflowlm/probe'] = {
    status: 'blocked',
    blockers: ['no-qualified-recipe'],
    changes: [],
    packages: [],
  }
  expect(await t.run(['engines', 'accelerators', 'fastflowlm', '--prepare', '--yes', '--json'])).not.toBe(0)
  expect(t.io.err.join('')).toContain('no-qualified-recipe')
  expect(t.link.calls.some((c) => c.path === '/runtimes/fastflowlm/operations')).toBe(false)
})

import wire from '../fixtures/fastflowlm/operation.json' with { type: 'json' }
it('returns manual SSH elevation instructions instead of waiting without showing them', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = { ...wire, pending_host_step: null }
  t.link.responses['POST /runtimes/fastflowlm/operations/operation-1/claim-host-step'] = () => {
    t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = wire
    return wire
  }
  expect(await t.run(['engines', 'accelerators', 'fastflowlm', '--resume', 'operation-1', '--json'])).toBe(0)
  expect(JSON.parse(t.io.out.join(''))).toMatchObject({
    operation_id: 'operation-1',
    state: 'preparing-host',
    host_steps: [{ instructions: 'fake' }],
  })
})
it('rejects stale consent without submitting a receipt or starting a helper', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = {
    ...wire,
    state: 'awaiting-consent',
    pending_host_step: null,
  }
  expect(
    await t.run([
      'engines',
      'accelerators',
      'fastflowlm',
      '--resume',
      'operation-1',
      '--approve',
      'sha256:wrong',
      '--json',
    ])
  ).not.toBe(0)
  expect(t.io.err.join('')).toContain('plan changed')
  expect(t.link.calls.some((c) => c.path.endsWith('/consent'))).toBe(false)
})
it('requires consent off a terminal and accepts only the displayed plan with --yes', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['POST /runtimes/fastflowlm/probe'] = { ...wire.plan, status: 'action-required' }
  t.link.responses['POST /runtimes/fastflowlm/operations'] = {
    ...wire,
    state: 'awaiting-consent',
    pending_host_step: null,
  }
  t.link.responses['POST /runtimes/fastflowlm/operations/operation-1/consent'] = wire
  t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = { ...wire, pending_host_step: null }
  t.link.responses['POST /runtimes/fastflowlm/operations/operation-1/claim-host-step'] = () => {
    t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = wire
    return wire
  }
  expect(await t.run(['engines', 'accelerators', 'fastflowlm', '--prepare', '--json'])).not.toBe(0)
  expect(t.link.calls.some((c) => c.path.endsWith('/consent'))).toBe(false)
  expect(await t.run(['engines', 'accelerators', 'fastflowlm', '--prepare', '--yes', '--json'])).toBe(0)
  expect(t.link.calls.find((c) => c.path.endsWith('/consent'))?.body).toEqual({
    approved_plan_digest: wire.plan.plan_digest,
    expected_revision: wire.revision,
  })
})
it('detaches preparation without claiming or launching a foreground helper', async () => {
  const t = testRun()
  cleanups.push(t.cleanup)
  t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = { ...wire, pending_host_step: null }
  t.link.responses['POST /runtimes/fastflowlm/operations/operation-1/claim-host-step'] = () => {
    t.link.responses['GET /runtimes/fastflowlm/operations/operation-1'] = wire
    return wire
  }
  expect(
    await t.run(['engines', 'accelerators', 'fastflowlm', '--resume', 'operation-1', '--detach', '--json'])
  ).toBe(0)
  expect(t.link.calls.some((c) => c.path.endsWith('/claim-host-step'))).toBe(false)
})

it.each([{ flags: [] }, { flags: ['--prepare', '--yes'] }])(
  'shows manual driver guidance with $flags without elevation',
  async ({ flags }) => {
    const t = testRun()
    cleanups.push(t.cleanup)
    t.link.responses['GET /runtimes/fastflowlm/accelerators'] = {
      ready: false,
      reason: 'driver-missing',
      blockers: ['driver-missing'],
    }
    t.link.responses['POST /runtimes/fastflowlm/probe'] = {
      status: 'blocked',
      blockers: ['driver-missing'],
      changes: [],
      packages: [],
      driver_setup: {
        title: 'Install the AMD NPU driver',
        steps: ['Install on the server, then check again.'],
        commands: [],
        links: [
          { label: 'AMD driver downloads', url: 'https://www.amd.com/en/support/download/drivers.html' },
        ],
      },
    }
    await t.run(['engines', 'accelerators', 'fastflowlm', ...flags])
    expect([...t.io.out, ...t.io.err].join('')).toContain(
      'https://www.amd.com/en/support/download/drivers.html'
    )
    expect(t.link.calls.some((c) => c.path === '/runtimes/fastflowlm/operations')).toBe(false)
  }
)
