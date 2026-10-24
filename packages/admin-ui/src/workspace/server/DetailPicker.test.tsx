import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DetailPicker } from './DetailPicker'
import { engineChoice, modelChoice } from './model-choices'
import { useDialog } from '../useDialog'

const choices = ['llamacpp-upstream', 'mlx', 'atomic-prism'].map(engineChoice)
function Picker() {
  const [value, setValue] = useState(choices[0].id)
  return (
    <>
      <DetailPicker
        label="Inference engine"
        value={value}
        choices={choices}
        placeholder="Choose engine"
        onChange={setValue}
      />
      <button>Next field</button>
    </>
  )
}

it('previews arrows, Home and End without changing the engine until Enter, then restores focus', async () => {
  render(<Picker />)
  const picker = screen.getByRole('combobox', { name: 'Inference engine' })
  await userEvent.tab()
  await userEvent.keyboard('{ArrowDown}{End}')
  expect(picker).toHaveValue('llamacpp-upstream')
  expect(picker).toHaveAttribute('aria-expanded', 'true')
  expect(document.getElementById(picker.getAttribute('aria-activedescendant')!)).toHaveTextContent(
    'Atomic Prism'
  )
  await userEvent.keyboard('{Home}{ArrowDown}{Enter}')
  expect(picker).toHaveValue('mlx')
  expect(picker).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await userEvent.keyboard('{ArrowUp}{Escape}')
  expect(picker).toHaveValue('mlx')
  expect(picker).toHaveFocus()
})

it('supports typeahead, pointer selection and Tab away without committing a highlighted value', async () => {
  render(<Picker />)
  const picker = screen.getByRole('combobox', { name: 'Inference engine' })
  await userEvent.tab()
  await userEvent.keyboard('mlx{Enter}')
  expect(picker).toHaveValue('mlx')
  await userEvent.click(picker)
  await userEvent.click(screen.getByRole('option', { name: /Atomic Prism/ }))
  expect(picker).toHaveValue('atomic-prism')
  expect(picker).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}{Home}{Tab}')
  expect(picker).toHaveValue('atomic-prism')
  expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await userEvent.click(picker)
  await userEvent.click(screen.getByText('Inference engine'))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(picker).toHaveValue('atomic-prism')
})

it('closes only the picker on Escape inside a dialog, then lets Escape close its parent', async () => {
  const close = vi.fn()
  function Dialog() {
    const ref = useDialog(close)
    return (
      <section ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
        <Picker />
      </section>
    )
  }
  render(<Dialog />)
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.keyboard('{Escape}')
  expect(close).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox')).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})

it('shows only supplied model metadata and disables an empty picker', async () => {
  const choice = modelChoice(
    { id: 'qwen', name: 'Qwen', description: 'Local coding model', size_bytes: 1024 },
    'Paused'
  )
  expect(choice).toMatchObject({
    id: 'qwen',
    name: 'Qwen',
    detail: 'Local coding model',
    metadata: 'Paused · 1.0 KiB on disk',
  })
  expect(modelChoice({ id: 'other' }).metadata).toBe('Downloaded')
  expect(engineChoice('other').detail).toBeUndefined()
  render(
    <DetailPicker label="Model" value="" choices={[]} placeholder="No downloaded models" onChange={vi.fn()} />
  )
  expect(screen.getByRole('combobox')).toBeDisabled()
  expect(screen.getByRole('combobox')).toHaveTextContent('No downloaded models')
})

it('preserves the highlighted model when a download refresh reorders the open choices', async () => {
  const pending = { id: 'pending', name: 'Downloading model', icon: null },
    existing = { id: 'existing', name: 'Downloaded model', icon: null }
  const change = vi.fn()
  const picker = (items: typeof choices) => (
    <DetailPicker
      label="Model"
      value="pending"
      choices={items}
      placeholder="Choose model"
      onChange={change}
    />
  )
  const view = render(picker([pending, existing]))
  const trigger = screen.getByRole('combobox', { name: 'Model' })
  await userEvent.click(trigger)
  await userEvent.keyboard('{ArrowDown}')
  expect(document.getElementById(trigger.getAttribute('aria-activedescendant')!)).toHaveTextContent(
    'Downloaded model'
  )
  view.rerender(picker([existing, { ...pending, name: 'Newly downloaded model' }]))
  expect(document.getElementById(trigger.getAttribute('aria-activedescendant')!)).toHaveTextContent(
    'Downloaded model'
  )
  await userEvent.keyboard('{Enter}')
  expect(change).toHaveBeenCalledWith('existing')
  expect(trigger).toHaveFocus()
})
