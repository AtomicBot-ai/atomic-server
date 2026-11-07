import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { SignIn } from './SignIn'

it('connects a refused token error to the field and keeps the token for correction', async () => {
  const login = vi.fn().mockRejectedValue(new Error('Token expired.'))
  initializeServiceHubStore({ session: () => ({ login }) } as never)
  render(<SignIn />)
  const input = screen.getByRole('textbox', { name: 'Or paste the token here' })
  fireEvent.change(input, { target: { value: ' token-value ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Token expired.')
  expect(input).toHaveAccessibleDescription('Token expired.')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveValue(' token-value ')
  expect(login).toHaveBeenCalledWith('token-value')
})
