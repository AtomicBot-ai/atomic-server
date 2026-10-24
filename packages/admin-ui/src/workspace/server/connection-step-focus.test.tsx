import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ConnectionGuide } from './ConnectionGuide'

it('focuses the initial and each new step heading, and restores the picker trigger on nested dismissal', async () => {
  const { workspace } = workspaceFixture({
    'models.installed': [{ id: 'qwen', name: 'Qwen', providers: ['llamacpp-upstream'] }],
    'models.catalog': [],
  })
  const { rerender } = render(
    <ConnectionGuide workspace={workspace} onClose={vi.fn()} onSettings={vi.fn()} />
  )
  expect(screen.getByRole('heading', { name: 'What would you like to connect?' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: /Configure an agent/ }))
  expect(screen.getByRole('heading', { name: 'Choose your agent' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Codex CLI', exact: true }))
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toHaveFocus()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  const picker = screen.getByRole('button', { name: 'Choose a local model' })
  await userEvent.click(picker)
  expect(screen.getByRole('dialog', { name: 'Choose a model for this connection' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(picker).toHaveFocus()
  rerender(<ConnectionGuide workspace={{ ...workspace }} onClose={vi.fn()} onSettings={vi.fn()} />)
  expect(picker).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  expect(screen.getByRole('heading', { name: 'Choose your agent' })).toHaveFocus()
})
