import { expect, it } from 'vitest'
import type { FastFlowLmOperation, FastFlowLmProbePlan } from '@atomic-chat/core/contracts'
import operation from '../../../test/fixtures/fastflowlm/operation.json' with { type: 'json' }
import { flmPreparationModel, flmDriverSetupLines } from './fastflowlm.js'
const op = operation as FastFlowLmOperation
const probe: FastFlowLmProbePlan = {
  ...op.plan,
  status: 'action-required',
  manifest_id: 'fixture',
  recipe_id: 'fixture',
  recipe_revision: 1,
  engine_version: null,
}
it('shows real service identity and pinned changes before exposing consent', () => {
  const view = flmPreparationModel({
    probe,
    operation: { ...op, state: 'awaiting-consent' },
    instructions: [],
  })
  expect(view.lines.join(' ')).toContain('atomic (system-service)')
  expect(view.lines.join(' ')).toContain('atomic-chat.service')
  expect(view.lines.join(' ')).toContain(op.plan.packages[0]!.sha256)
  expect(view.actions.map((a) => a.id)).toEqual(['consent', 'stop'])
  expect(view.digest).toBe(op.plan.plan_digest)
})
it.each(['reboot-required', 'relogin-required', 'failed'] as const)(
  'keeps %s resumable without a new preparation',
  (state) => {
    const view = flmPreparationModel({ probe, operation: { ...op, state }, instructions: [] })
    expect(view.actions.map((a) => a.id)).toEqual(['resume'])
  }
)
it('does not offer automatic preparation for an unqualified recipe', () => {
  expect(
    flmPreparationModel({ probe: { ...probe, status: 'blocked' }, operation: null, instructions: [] }).actions
  ).toEqual([])
})

it('renders manual commands and URLs in the terminal with a read-only recheck', () => {
  const driver_setup = {
    title: 'Linux NPU setup',
    steps: ['Run on the server.'],
    commands: ['sudo apt install amdxdna-dkms'],
    links: [{ label: 'Guide', url: 'https://lemonade-server.ai/flm_npu_linux.html' }],
  }
  const view = flmPreparationModel({
    probe: { ...probe, status: 'blocked', driver_setup },
    operation: null,
    instructions: [],
  })
  expect(view.actions).toEqual([{ id: 'refresh', label: 'Check again' }])
  expect(flmDriverSetupLines(view.driverSetup)).toEqual([
    'Linux NPU setup',
    'Run on the server.',
    'sudo apt install amdxdna-dkms',
    'Guide: https://lemonade-server.ai/flm_npu_linux.html',
  ])
  expect(flmDriverSetupLines(undefined)).toEqual([])
})
