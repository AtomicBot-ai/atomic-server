import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { beforeEach } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { workspaceFixture } from '@/test/workspace-fixture'
import { refreshSharedReads } from '../../watch-shared-read'
import { EngineSettings } from './EngineSettings'

beforeEach(() => {
  Object.defineProperty(File.prototype, 'text', {
    configurable: true,
    value: function (this: File) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsText(this)
      })
    },
  })
})

it.each([
  { flash_attn: 'qa-invalid-mode' },
  { cache_type_k: 'qa-invalid-cache' },
  { threads: '4' },
  { threads: null },
  { flash_attn: true },
  { threads: 4, flash_attn: 'invalid' },
])('rejects an invalid preset atomically: %j', async (values) => {
  const { workspace, execute } = workspaceFixture({
    'settings.get': { revision: 1, values: { threads: 2, flash_attn: 'auto', cache_type_k: 'f16' } },
    'settings.schema': { descriptors: settingsSchema('llamacpp-upstream') },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={() => {}} />)
  await screen.findByLabelText('Threads')
  const preset = new File(
    [JSON.stringify({ format: 'atomic-engine-settings-v1', provider: 'llamacpp-upstream', values })],
    'preset.json',
    { type: 'application/json' }
  )
  await userEvent.upload(screen.getByLabelText('Import settings for this engine'), preset)
  expect(await screen.findByRole('alert')).toHaveTextContent(/threads|flash_attn|cache_type_k/)
  await act(async () => {
    refreshSharedReads()
  })
  expect(screen.getByRole('alert')).toHaveTextContent(/threads|flash_attn|cache_type_k/)
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Threads')).toHaveValue(2)
  expect(execute.mock.calls.some(([name]) => name === 'settings.update')).toBe(false)
})

it('stages a valid preset and sends only its changes with the saved revision', async () => {
  const { workspace, execute } = workspaceFixture({
    'settings.get': { revision: 7, values: { threads: 2, flash_attn: 'auto' } },
    'settings.schema': { descriptors: settingsSchema('llamacpp-upstream') },
    'settings.update': { revision: 8 },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={() => {}} />)
  await screen.findByLabelText('Threads')
  await userEvent.upload(
    screen.getByLabelText('Import settings for this engine'),
    new File(
      [
        JSON.stringify({
          format: 'atomic-engine-settings-v1',
          provider: 'llamacpp-upstream',
          values: { threads: 4, flash_attn: 'off' },
        }),
      ],
      'preset.json',
      { type: 'application/json' }
    )
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
  expect(execute).toHaveBeenCalledWith('settings.update', {
    provider: 'llamacpp-upstream',
    values: { threads: 4, flash_attn: 'off' },
    expected_revision: 7,
  })
})

it('shows an unsupported stored enum explicitly rather than displaying the first valid option', async () => {
  const { workspace } = workspaceFixture({
    'settings.get': { revision: 1, values: { flash_attn: 'legacy-invalid' } },
    'settings.schema': { descriptors: settingsSchema('llamacpp-upstream') },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={() => {}} />)
  expect(await screen.findByLabelText('Flash Attention')).toHaveDisplayValue(
    'Unsupported saved value: legacy-invalid'
  )
})
