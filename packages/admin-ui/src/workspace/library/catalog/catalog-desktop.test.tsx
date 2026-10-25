import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CatalogBrowse } from './CatalogBrowse'
const models = [
  { id: 'repo/qwen', name: 'Qwen', source: { format: 'gguf' }, downloads: 3 },
  { id: 'repo/llama', name: 'Llama uncensored', downloads: 9 },
]
beforeEach(() => localStorage.clear())
function renderCatalog() {
  const { execute } = workspaceFixture({
    'models.installed': [],
    'artifacts.list': [],
    'models.files': [
      { filename: 'Q4.gguf', size: 100 },
      { filename: 'Q8.gguf', size: 200 },
    ],
  })
  const choose = vi.fn()
  render(
    <CatalogBrowse
      catalog={models}
      category="text"
      setCategory={vi.fn()}
      format="gguf"
      setFormat={vi.fn()}
      query=""
      setQuery={vi.fn()}
      engines={[]}
      loading={false}
      execute={execute as never}
      search={vi.fn()}
      choose={choose}
      importFile={vi.fn()}
    />
  )
  return { choose }
}
it('opens variant controls inline and downloads exactly the chosen variant', async () => {
  const { choose } = renderCatalog()
  await userEvent.click(screen.getByRole('button', { name: 'Qwen', exact: true }))
  await userEvent.selectOptions(await screen.findByLabelText('Variant for Qwen'), 'Q8.gguf')
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'repo/qwen', selectedFile: 'Q8.gguf' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('filters liked and uncensored rows and clears filters without losing the menu', async () => {
  renderCatalog()
  await userEvent.click(screen.getByRole('button', { name: 'Like Qwen' }))
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Liked models' }))
  expect(screen.queryByRole('button', { name: 'Llama uncensored', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Uncensored' }))
  expect(screen.queryByRole('button', { name: 'Qwen', exact: true })).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Filters 1' })).toHaveAttribute('aria-expanded', 'false')
})
it('sorts download counts through the separate Sort menu', async () => {
  renderCatalog()
  await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Downloads', exact: true }))
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /^(Qwen|Llama uncensored)$/ })[0]).toHaveTextContent('Llama')
  )
})
it('moves through filter groups with arrow keys and restores the trigger on Escape', async () => {
  renderCatalog()
  const filters = screen.getByRole('button', { name: 'Filters' })
  filters.focus()
  await userEvent.keyboard('{ArrowDown}')
  expect(screen.getByRole('radio', { name: 'All engines' })).toHaveFocus()
  await userEvent.keyboard('{End}')
  expect(screen.getByRole('button', { name: 'Clear filters' })).toHaveFocus()
  await userEvent.keyboard('{Home}{ArrowDown}')
  expect(screen.getByRole('radio', { name: 'GGUF' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(filters).toHaveFocus()
  expect(filters).toHaveAttribute('aria-expanded', 'false')
})
it('returns focus after choosing a sort and dismisses the popover when Tab leaves it', async () => {
  renderCatalog()
  const sort = screen.getByRole('button', { name: 'Sort' })
  await userEvent.click(sort)
  await userEvent.keyboard('{ArrowDown} ')
  expect(sort).toHaveFocus()
  expect(sort).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(sort)
  expect(screen.getByRole('radio', { name: 'Downloads', exact: true })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus()
  expect(sort).toHaveAttribute('aria-expanded', 'false')
})
