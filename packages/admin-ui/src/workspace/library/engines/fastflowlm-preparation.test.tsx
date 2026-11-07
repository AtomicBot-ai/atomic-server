import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FastFlowLmPreparation } from './FastFlowLmPreparation'
const plan = {
  plan_digest: 'sha256:reviewed',
  runtime_account: 'atomic',
  runtime_mode: 'system-service',
  runtime_service: 'atc.service',
  packages: [{ name: 'driver', version: '1', source: 'https://fixture.test/driver', sha256: 'pinned' }],
  changes: [{ text: 'Set the service memlock limit' }],
  blockers: [],
}
it('restores the active operation across closing the admin and submits its exact consent', async () => {
  const { workspace, execute } = workspaceFixture({
    'fastflowlm.probe': { ...plan, status: 'action-required' },
    // The UUID order must never hide an active operation behind an old completed one.
    'fastflowlm.operations': [
      { operation_id: 'active', revision: 4, state: 'awaiting-consent', plan },
      { operation_id: 'z-old', revision: 7, state: 'ready', plan },
    ],
    'fastflowlm.host-steps': [],
  })
  const first = render(<FastFlowLmPreparation workspace={workspace} />)
  expect(await screen.findByText('Service: atc.service')).toBeTruthy()
  expect(screen.getByText('Set the service memlock limit')).toBeTruthy()
  first.unmount()
  render(<FastFlowLmPreparation workspace={workspace} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Agree to these changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('fastflowlm.consent', {
      id: 'active',
      expected_revision: 4,
      approved_plan_digest: 'sha256:reviewed',
    })
  )
  expect(execute.mock.calls.some(([name]) => name === 'fastflowlm.prepare')).toBe(false)
})

it('shows server driver instructions and rechecks without starting preparation', async () => {
  const { workspace, execute } = workspaceFixture({
    'fastflowlm.probe': {
      ...plan,
      status: 'blocked',
      changes: [],
      packages: [],
      blockers: ['driver-missing'],
      driver_setup: {
        title: 'Set up the Linux NPU driver',
        steps: ['Run on the Linux server.'],
        commands: ['sudo apt install amdxdna-dkms'],
        links: [{ label: 'Linux NPU setup guide', url: 'https://lemonade-server.ai/flm_npu_linux.html' }],
      },
    },
    'fastflowlm.operations': [],
    'fastflowlm.host-steps': [],
  })
  render(<FastFlowLmPreparation workspace={workspace} />)
  expect(await screen.findByText('sudo apt install amdxdna-dkms')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Linux NPU setup guide' }).getAttribute('href')).toBe(
    'https://lemonade-server.ai/flm_npu_linux.html'
  )
  const reads = execute.mock.calls.filter(([name]) => name === 'fastflowlm.probe').length
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await waitFor(() =>
    expect(execute.mock.calls.filter(([name]) => name === 'fastflowlm.probe').length).toBeGreaterThan(reads)
  )
  expect(
    execute.mock.calls.some(([name]) =>
      ['fastflowlm.prepare', 'fastflowlm.refresh', 'fastflowlm.consent'].includes(name)
    )
  ).toBe(false)
})
