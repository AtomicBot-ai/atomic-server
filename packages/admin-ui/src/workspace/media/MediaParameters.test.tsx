import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { MediaParameters } from './MediaParameters'
import type { RecordValue } from '../types'

it('labels the numeric value separately from its slider and describes invalid values on both', async () => {
  function Form() {
    const [values, setValues] = useState<RecordValue>({ workflow: 'create', steps: 99, width: 1 })
    return (
      <MediaParameters
        task="image"
        capabilities={{}}
        values={values}
        disabled={false}
        change={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      />
    )
  }
  render(<Form />)
  const number = screen.getByRole('spinbutton', { name: 'Steps' })
  const slider = screen.getByRole('slider', { name: 'Steps slider' })
  expect(slider).toHaveAttribute('aria-invalid', 'true')
  expect(slider).toHaveAccessibleDescription(
    'Use a value from 1 to 50 for this model. Your value has been kept.'
  )
  await userEvent.click(screen.getByText('Steps', { exact: true }))
  expect(number).toHaveFocus()
  fireEvent.change(slider, { target: { value: '20' } })
  expect(number).toHaveValue(20)
  expect(slider).not.toHaveAttribute('aria-invalid', 'true')
  expect(number).not.toHaveAttribute('aria-describedby')
  const width = screen.getByRole('spinbutton', { name: 'Width' })
  expect(width).toHaveAccessibleDescription(/Use a value from 64 to 8192/)
  await userEvent.click(screen.getByText('Width', { exact: true }))
  expect(width).toHaveFocus()
})
