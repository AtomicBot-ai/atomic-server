import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineSettings } from './EngineSettings'

it('shows and saves core FLM launch settings in Common and Advanced', async () => {
  const descriptors = settingsSchema('fastflowlm')
  const values = Object.fromEntries(descriptors.map((d) => [d.key, d.controllerProps.value]))
  const { workspace, execute } = workspaceFixture({
    'settings.get': { revision: 3, values },
    'settings.schema': { descriptors },
    'settings.update': { revision: 4 },
  })
  render(<EngineSettings provider="fastflowlm" workspace={workspace} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
  expect(await screen.findByLabelText('Context Length')).toHaveValue(0)
  await userEvent.selectOptions(screen.getByLabelText('NPU Power Mode'), 'balanced')
  await userEvent.click(screen.getByRole('button', { name: 'Advanced', exact: true }))
  expect(screen.getByLabelText('Prefill Chunk Length')).toHaveValue(0)
  expect(screen.getByLabelText('Prefix Cache Limit (MiB)')).toHaveValue(4096)
  expect(screen.getByLabelText('Prefix Cache Minimum Gain')).toHaveValue(128)
  const slots = screen.getByLabelText('Prefix Cache Slots')
  await userEvent.clear(slots)
  await userEvent.type(slots, '0')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(execute).toHaveBeenCalledWith('settings.update', {
    provider: 'fastflowlm',
    values: { pmode: 'balanced', prefix_slots: 0 },
    expected_revision: 3,
  })
})
