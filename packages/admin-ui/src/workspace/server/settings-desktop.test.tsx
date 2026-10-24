import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { RuntimeSettings } from './RuntimeSettings'
import { HardwareSettings } from './HardwareSettings'

const config = {
  values: { models: { autoLoad: [] }, managed: { mode: 'off' }, admin: { autoStart: true, port: 1338 } },
  fields: [
    { path: 'models.autoLoad', type: 'string[]' },
    { path: 'managed.mode', type: 'enum', values: ['off', 'docker-tensorrt'] },
    { path: 'admin.autoStart', type: 'boolean' },
    { path: 'admin.port', type: 'number', min: 0, max: 65535 },
  ],
}
it('preserves per-section drafts and saves only the visible section', async () => {
  const { workspace, execute } = workspaceFixture({ 'config.get': config })
  const { rerender } = render(<RuntimeSettings workspace={workspace} section="models" />)
  await userEvent.type(await screen.findByLabelText('Models to load on start'), 'first, second')
  rerender(<RuntimeSettings workspace={workspace} section="managed" />)
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Container runtime'), 'docker-tensorrt')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('config.update', { values: { 'managed.mode': 'docker-tensorrt' } })
  )
  rerender(<RuntimeSettings workspace={workspace} section="models" />)
  expect(screen.getByLabelText('Models to load on start')).toHaveValue('first, second')
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByLabelText('Models to load on start')).toHaveValue('')
})
it('locks controls during saving and preserves a failed draft for retry', async () => {
  let rejectSave!: (error: Error) => void
  const { workspace } = workspaceFixture({
    'config.get': config,
    'config.update': () =>
      new Promise((_, reject) => {
        rejectSave = reject
      }),
  })
  render(<RuntimeSettings workspace={workspace} section="admin" />)
  const toggle = await screen.findByRole('switch', { name: 'Start web admin automatically' })
  toggle.focus()
  await userEvent.keyboard(' ')
  expect(toggle).not.toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(toggle).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
  await act(async () => rejectSave(new Error('Could not write configuration')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not write configuration')
  expect(toggle).toBeEnabled()
  expect(toggle).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
})
it('validates numeric limits and does not silently turn an empty value into zero', async () => {
  const { workspace, execute } = workspaceFixture({ 'config.get': config })
  render(<RuntimeSettings workspace={workspace} section="admin" />)
  await userEvent.click(await screen.findByText('Advanced settings'))
  const port = screen.getByLabelText('Admin port')
  await userEvent.clear(port)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(port).toHaveAttribute('aria-invalid', 'true')
  expect(port).toHaveAccessibleDescription('Enter a whole number from 0 to 65535.')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 0 to 65535.')
  await userEvent.type(port, '70000')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await userEvent.clear(port)
  await userEvent.type(port, '1337.5')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalledWith('config.update', expect.anything())
  await userEvent.clear(port)
  await userEvent.type(port, '1778')
  expect(port).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'admin.port': 1778 } })
})
it('retries hardware lookup and shows real facts with the core memory units', async () => {
  let attempts = 0
  const { workspace } = workspaceFixture({
    'hardware.info': () => {
      if (!attempts++) throw new Error('Hardware unavailable')
      return {
        info: {
          os_type: 'macos',
          os_name: 'macOS',
          cpu: { name: 'Apple Silicon', arch: 'arm64', core_count: 10 },
          total_memory: 16384,
          gpus: [],
        },
        warnings: [],
      }
    },
  })
  render(<HardwareSettings workspace={workspace} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Hardware unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Apple Silicon')).toBeInTheDocument()
  expect(screen.getByText('16.0 GiB')).toBeInTheDocument()
})
