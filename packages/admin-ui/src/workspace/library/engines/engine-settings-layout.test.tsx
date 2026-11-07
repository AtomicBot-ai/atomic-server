import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineSettings } from './EngineSettings'

it('separates installation from settings while preserving unsaved edits across tabs', async () => {
  const { workspace } = workspaceFixture({
    'engines.list': {
      engines: [{ engine: 'llamacpp-upstream', kind: 'engine-build', builds: [], active: null }],
    },
    'settings.get': { values: { ctx_size: 2048 } },
    'settings.schema': {
      descriptors: [
        {
          key: 'ctx_size',
          title: 'Context length',
          controllerType: 'number',
          controllerProps: { min: 0, type: 'number' },
          default: 2048,
        },
      ],
    },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={vi.fn()} />)
  expect(await screen.findByRole('button', { name: 'Install engine' })).toBeVisible()
  expect(screen.queryByRole('spinbutton', { name: 'Context length' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
  const field = await screen.findByRole('spinbutton', { name: 'Context length' })
  await userEvent.clear(field)
  await userEvent.type(field, '4096')
  await userEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  expect(screen.getByRole('tab', { name: /Settings/ })).toHaveTextContent('1')
  await userEvent.click(screen.getByRole('tab', { name: /Settings/ }))
  expect(screen.getByRole('spinbutton', { name: 'Context length' })).toHaveValue(4096)
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(
    within(screen.getByRole('dialog', { name: 'Discard unsaved engine settings?' })).getByRole('button', {
      name: 'Discard changes',
    })
  ).toBeInTheDocument()
})

it('keeps settings visible after the final reviewed change is discarded', async () => {
  const { workspace } = workspaceFixture({
    'settings.get': { values: { threads: 2 } },
    'settings.schema': {
      descriptors: [
        { key: 'threads', title: 'Threads', controllerType: 'input', controllerProps: { type: 'number' } },
      ],
    },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
  await userEvent.clear(await screen.findByRole('spinbutton', { name: 'Threads' }))
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Threads' }), '4')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Review changes (1)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByRole('spinbutton', { name: 'Threads' })).toHaveValue(2)
})
