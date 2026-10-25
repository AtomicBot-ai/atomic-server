import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

function renderCatalog() {
  const { workspace, execute } = workspaceFixture({
    'engines.list': { engines: [] },
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  return execute
}

it('previews category choices with the keyboard and Escape returns focus without changing the catalog', async () => {
  const execute = renderCatalog()
  const picker = screen.getByRole('combobox', { name: 'Model category' })
  picker.focus()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}')
  expect(screen.getByRole('listbox', { name: 'Model category' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Images/ })).toHaveTextContent('Generate images from a prompt')
  expect(picker).toHaveValue('text')
  await userEvent.keyboard('{Escape}')
  expect(picker).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('models.catalog', { category: 'image' })
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
  await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'image' }))
  expect(picker).toHaveValue('image')
  expect(picker).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
  await userEvent.keyboard('{ArrowDown}{Home}{Enter}')
  expect(picker).toHaveValue('text')
  expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
})

it('closes the filter popup before opening the category menu and selects a category with the mouse', async () => {
  const execute = renderCatalog()
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(screen.getByRole('radio', { name: 'All engines' })).toBeInTheDocument()
  const picker = screen.getByRole('combobox', { name: 'Model category' })
  await userEvent.click(picker)
  expect(screen.queryByRole('radio', { name: 'All engines' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('option', { name: /Video/ }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'video' }))
  expect(picker).toHaveValue('video')
  expect(picker).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
