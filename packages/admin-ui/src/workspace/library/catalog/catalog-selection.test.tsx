// Regressions for catalog selection, request identity and installed-model reads.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'
import { CatalogBrowse } from './CatalogBrowse'
beforeEach(() => localStorage.clear())
const base = {
  'engines.list': enginesList(['llamacpp-upstream', 'mlx', 'fastflowlm', 'audio-cpp', 'vllm', 'sglang']),
  'models.catalog': (i: Record<string, unknown>) =>
    i.engine
      ? { models: [{ repository: `${i.engine}/model` }] }
      : { rows: [{ id: 'gguf', name: 'GGUF model', category: 'text', source: { format: 'gguf' } }] },
  'models.search': {
    models: [{ model_id: 'qwen', name: 'Qwen FLM', default_variant: 'qwen-npu', variants: [] }],
  },
  'models.installed': [],
  'artifacts.list': [],
}
async function filters() {
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
}
function group(label: string) {
  return within(screen.getByText(label, { selector: 'legend' }).parentElement!)
}
async function engine(name: string) {
  await filters()
  await userEvent.click(await group('Engine').findByRole('radio', { name }))
  await userEvent.keyboard('{Escape}')
}
it('offers Audio only as a category, never as a text/GGUF engine', async () => {
  const { workspace } = workspaceFixture(base)
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await filters()
  await group('Engine').findByRole('radio', { name: 'FastFlowLM' })
  expect(group('Engine').queryByRole('radio', { name: /audio/i })).not.toBeInTheDocument()
  expect(group('Engine').queryByRole('radio', { name: /stable diffusion|sd.cpp/i })).not.toBeInTheDocument()
})
it('retains the FLM engine and format after Audio and back', async () => {
  const { workspace } = workspaceFixture(base)
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await engine('FastFlowLM')
  await screen.findByText('Qwen FLM', { selector: 'strong' })
  for (const category of ['Audio', 'Text']) {
    await userEvent.click(screen.getByRole('combobox', { name: 'Model category' }))
    await userEvent.click(screen.getByRole('option', { name: new RegExp(category) }))
  }
  await filters()
  expect(group('Engine').getByRole('radio', { name: 'FastFlowLM' })).toBeChecked()
  expect(group('Format').getByRole('radio', { name: 'FastFlowLM' })).toBeChecked()
  expect(await screen.findByText('Qwen FLM', { selector: 'strong' })).toBeInTheDocument()
})
it('restores the saved choice on remount', async () => {
  const { workspace } = workspaceFixture(base)
  const v = render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await engine('FastFlowLM')
  await screen.findByText('Qwen FLM', { selector: 'strong' })
  v.unmount()
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await filters()
  expect(group('Engine').getByRole('radio', { name: 'FastFlowLM' })).toBeChecked()
  expect(group('Format').getByRole('radio', { name: 'FastFlowLM' })).toBeChecked()
})
it('keeps the visible engine filter aligned with requests after a tab change', async () => {
  const { workspace, execute } = workspaceFixture(base)
  const v = render(<Catalog section="catalog" workspace={workspace} openCommand={vi.fn()} />)
  await engine('SGLang')
  await screen.findByText('sglang/model', { selector: 'strong' })
  v.rerender(<Catalog section="downloads" workspace={workspace} openCommand={vi.fn()} />)
  v.rerender(<Catalog section="catalog" workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('sglang/model', { selector: 'strong' })
  await filters()
  expect(group('Engine').getByRole('radio', { name: 'SGLang' })).toBeChecked()
  expect(execute).toHaveBeenCalledWith('models.catalog', { engine: 'sglang' })
  expect(screen.queryByText('vllm/model', { selector: 'strong' })).not.toBeInTheDocument()
})
const browse = (execute: never) => ({
  catalog: [{ id: 'phi', name: 'Blue Red', format: 'foundry', providers: ['foundry-local'] }],
  category: 'text',
  setCategory: vi.fn(),
  format: 'foundry' as const,
  setFormat: vi.fn(),
  query: 'red blue',
  setQuery: vi.fn(),
  engines: [],
  loading: false,
  execute,
  search: vi.fn(),
  choose: vi.fn(),
  importFile: vi.fn(),
})
it('keeps a valid server multiword search result', async () => {
  const { execute } = workspaceFixture(base)
  render(<CatalogBrowse {...browse(execute as never)} />)
  expect(await screen.findByText('Blue Red', { selector: 'strong' })).toBeInTheDocument()
})
it('does not start another installed-model read on snapshot-only updates', async () => {
  const { workspace, execute } = workspaceFixture({
    ...base,
    'models.installed': () => new Promise(() => {}),
  })
  const props = { ...browse(execute as never), query: '' }
  const v = render(<CatalogBrowse {...props} workspace={workspace} />)
  await waitFor(() =>
    expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(1)
  )
  await act(async () =>
    v.rerender(
      <CatalogBrowse
        {...props}
        workspace={{ ...workspace, snapshot: { ...workspace.snapshot!, captured_at: 2 } }}
      />
    )
  )
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(1)
})

it('reloads after selecting another engine with the same GGUF format and after All engines', async () => {
  const { workspace, execute } = workspaceFixture({
    ...base,
    'engines.list': enginesList(['llamacpp-upstream', 'llamacpp']),
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('GGUF model', { selector: 'strong' })
  await engine('llama.cpp')
  expect(await screen.findByText('GGUF model', { selector: 'strong' })).toBeInTheDocument()
  await engine('All engines')
  expect(await screen.findByText('GGUF model', { selector: 'strong' })).toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'models.catalog')).toHaveLength(3)
})
it('reads every managed catalog for All engines and preserves the chosen query and sort on remount', async () => {
  const { workspace, execute } = workspaceFixture({
    ...base,
    'models.search': (i: Record<string, unknown>) => ({
      models: [{ repository: `${i.engine}/${i.query}`, note: 'Remote match' }],
    }),
  })
  const view = render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await engine('SGLang')
  await screen.findByText('sglang/model', { selector: 'strong' })
  await engine('All engines')
  await screen.findByText('vllm/model', { selector: 'strong' })
  expect(screen.getByText('sglang/model', { selector: 'strong' })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search for models'), 'qwen{Enter}')
  await screen.findByText('vllm/qwen', { selector: 'strong' })
  await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Downloads' }))
  view.unmount()
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  expect(screen.getByLabelText('Search for models')).toHaveValue('qwen')
  await screen.findByText('sglang/qwen', { selector: 'strong' })
  await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
  expect(screen.getByRole('radio', { name: 'Downloads' })).toBeChecked()
  expect(execute).toHaveBeenCalledWith('models.search', { engine: 'vllm', query: 'qwen' })
})
