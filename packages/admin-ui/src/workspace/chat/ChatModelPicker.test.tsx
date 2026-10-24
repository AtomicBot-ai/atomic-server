import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceApi } from '../workspace-api'
import { ChatModelPicker } from './ChatModelPicker'
import { CHAT_DEFAULTS } from './chat-preferences'
const models = [
  { id: 'loaded', provider: 'llamacpp', model: 'Qwen-4B', kind: 'chat', state: 'ready', details: {} },
  { id: 'loading', provider: 'llamacpp', model: 'Large-model', kind: 'chat', state: 'loading', details: {} },
]
afterEach(() => vi.restoreAllMocks())
it('searches models, selects a ready model, and dismisses with Escape', async () => {
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const setSelected = vi.fn()
  render(
    <ChatModelPicker
      models={models as never}
      selected=""
      setSelected={setSelected}
      preferences={CHAT_DEFAULTS}
      save={vi.fn()}
      disabled={false}
      onCatalog={vi.fn()}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Choose chat model' }))
  expect(screen.getByRole('dialog').parentElement).toHaveClass('modal-shade')
  expect(screen.getByRole('button', { name: 'Large model llamacpp · loading' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Search ready models'), 'Qwen')
  expect(screen.queryByText('Large model')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Qwen 4B llamacpp · ready' }))
  expect(setSelected).toHaveBeenCalledWith('loaded')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Choose chat model' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose chat model' })).toHaveFocus()
})

it('dismisses the model popup through its dimmed backdrop without selecting a model', async () => {
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const selected = vi.fn()
  render(
    <ChatModelPicker
      models={models as never}
      selected=""
      setSelected={selected}
      preferences={CHAT_DEFAULTS}
      save={vi.fn()}
      disabled={false}
      onCatalog={vi.fn()}
    />
  )
  const trigger = screen.getByRole('button', { name: 'Choose chat model' })
  await userEvent.click(trigger)
  await userEvent.click(screen.getByRole('dialog').parentElement!)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(selected).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
})
