import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { Field } from './Controls'
import { SettingsField } from './SettingsForm'

it('associates native labels, hints and errors without dropping a control description', async () => {
  render(
    <>
      <p id="existing">Existing description.</p>
      <SettingsField
        label="Limit"
        hint="Documents per request."
        error="Enter a positive number."
        unit="files"
      >
        <input type="number" aria-describedby="existing" />
      </SettingsField>
      <SettingsField label="Limit">
        <input type="number" />
      </SettingsField>
    </>
  )
  const fields = screen.getAllByRole('spinbutton', { name: 'Limit' })
  expect(fields[0]).toHaveAccessibleDescription(
    'Existing description. Documents per request. files Enter a positive number.'
  )
  expect(fields[0]).toHaveAttribute('aria-invalid', 'true')
  expect(fields[0].id).not.toBe(fields[1].id)
  await userEvent.click(screen.getAllByText('Limit')[0])
  expect(fields[0]).toHaveFocus()
})

it('uses the shared field for compact forms and preserves composite controls', async () => {
  render(
    <>
      <Field label="Engine" hint="Choose an installed engine.">
        <select defaultValue="cpu">
          <option value="cpu">CPU</option>
          <option value="gpu">GPU</option>
        </select>
      </Field>
      <Field label="Token">
        <div>
          <input aria-label="Token" defaultValue="saved" />
          <button>Copy</button>
        </div>
      </Field>
    </>
  )
  const select = screen.getByRole('combobox', { name: 'Engine' })
  expect(select).toHaveAccessibleDescription('Choose an installed engine.')
  await userEvent.selectOptions(select, 'gpu')
  expect(select).toHaveValue('gpu')
  expect(screen.getByRole('textbox', { name: 'Token' })).toHaveValue('saved')
  expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
})

it('keeps field actions separate from the control label and value', async () => {
  render(
    <SettingsField label="API key" actions={<button>Manage keys</button>}>
      <select defaultValue="personal">
        <option value="personal">Personal key</option>
      </select>
    </SettingsField>
  )
  const control = screen.getByRole('combobox', { name: 'API key' })
  await userEvent.click(screen.getByRole('button', { name: 'Manage keys' }))
  expect(control).toHaveValue('personal')
  expect(screen.getByRole('button', { name: 'Manage keys' })).toHaveFocus()
  await userEvent.click(screen.getByText('API key', { exact: true }))
  expect(control).toHaveFocus()
})
