import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { refreshSharedReads } from '../../watch-shared-read'
import { Catalog } from '../catalog/Catalog'
import { EnginesTab } from './EnginesTab'

it('groups installed engines first and opens the named row from the keyboard', async () => {
  const onSettings = vi.fn()
  render(
    <EnginesTab
      engines={[
        { engine: 'sglang' },
        { engine: 'llamacpp-upstream', active: { version: 'b12019', variant: 'win-vulkan-x64' } },
        { engine: 'litert-lm', builds: [{ version: '0.18.1' }] },
      ]}
      loading={false}
      onSettings={onSettings}
    />
  )
  const installed = screen.getByRole('region', { name: 'Installed' })
  const available = screen.getByRole('region', { name: 'Available to install' })
  expect(within(installed).getByRole('button', { name: 'llama.cpp', exact: true })).toHaveTextContent(
    'b12019 · win-vulkan-x64'
  )
  expect(within(installed).getByRole('button', { name: 'LiteRT-LM', exact: true })).toBeInTheDocument()
  const row = within(available).getByRole('button', { name: 'SGLang', exact: true })
  row.focus()
  await userEvent.keyboard('{Enter}')
  expect(onSettings).toHaveBeenCalledWith('sglang')
  expect(screen.queryByRole('button', { name: 'Engine settings' })).toBeNull()
})

it('replaces the top refresh with error-local retry', async () => {
  let failed = true
  const { workspace } = workspaceFixture({
    'engines.list': () => {
      if (failed) throw new Error('Cannot read engines')
      return { engines: [{ engine: 'llamacpp-upstream' }] }
    },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} section="engines" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot read engines')
  expect(screen.queryByRole('button', { name: 'Refresh', exact: true })).toBeNull()
  failed = false
  await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: 'llama.cpp', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('updates after server changes and returns focus to the row after it moves into Installed', async () => {
  let installed = false
  const { workspace } = workspaceFixture({
    'engines.list': () => ({
      engines: [
        {
          engine: 'llamacpp-upstream',
          active: installed ? { version: 'b1', variant: 'cpu' } : null,
          builds: [],
        },
      ],
    }),
    'settings.schema': { descriptors: [] },
    'settings.get': { values: {} },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} section="engines" />)
  await userEvent.click(await screen.findByRole('button', { name: 'llama.cpp', exact: true }))
  const panel = screen.getByRole('dialog', { name: 'llamacpp-upstream settings' })
  expect(panel.parentElement).toHaveClass('engine-drawer-shade')
  installed = true
  await act(async () => refreshSharedReads())
  const group = await screen.findByRole('region', { name: 'Installed' })
  expect(within(group).getByRole('button', { name: 'llama.cpp', exact: true })).toHaveTextContent('b1 · cpu')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'llama.cpp', exact: true })).toHaveFocus()
})
