import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

// Clicking a filter's text activates its label: the browser moves focus to the input and reports the
// blur with no related target. That blur must not close the popover before the input toggles.
it('toggles a filter when its text is clicked, and keeps the popover open', async () => {
  const { workspace } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  const label = screen.getByText('Uncensored')
  fireEvent.blur(label, { relatedTarget: null })
  expect(screen.getByRole('checkbox', { name: 'Uncensored' })).toBeInTheDocument()
  await userEvent.click(label)
  expect(screen.getByRole('checkbox', { name: 'Uncensored' })).toBeChecked()
  expect(screen.getByRole('button', { name: /^Filters 1/ })).toBeInTheDocument()
  // Focus leaving for somewhere else still closes it.
  fireEvent.blur(label, { relatedTarget: document.body })
  expect(screen.queryByRole('checkbox', { name: 'Uncensored' })).not.toBeInTheDocument()
})
