import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { Action } from './Controls'

it('keeps an action name while busy and prevents duplicate submissions', async () => {
  let complete!: () => void
  let calls = 0
  const request = new Promise<void>((resolve) => {
    complete = resolve
  })
  render(
    <Action
      onClick={() => {
        calls++
        return request
      }}
    >
      Configure endpoint
    </Action>
  )
  const button = screen.getByRole('button', { name: 'Configure endpoint' })
  await userEvent.click(button)
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button).toBeDisabled()
  expect(button).toHaveAccessibleName('Configure endpoint')
  await userEvent.click(button)
  expect(calls).toBe(1)
  await act(async () => {
    complete()
    await request
  })
  expect(button).toBeEnabled()
  expect(button).not.toHaveAttribute('aria-busy')
})
