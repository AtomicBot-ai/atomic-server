/** The setup's last step points at `atc login` while accounts are on and nobody is signed in. */
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { accountFixture } from '@/test/account-fixture'
import { Destinations } from './Purpose'

const HINT = 'Share this server with your devices: atc login'

it.each([
  ['accounts on, signed out', accountFixture(), true],
  ['signed in', accountFixture({ signed_in: true, user: { email: 'a@b.c', display_name: null } }), false],
  ['accounts off', accountFixture({ enabled: false }), false],
  ['no account in the snapshot', undefined, false],
])('the sharing hint, %s', (_case, account, shown) => {
  render(<Destinations choose={vi.fn()} account={account} />)
  if (shown) expect(screen.getByText(/Share this server with your devices/)).toHaveTextContent(HINT)
  else expect(screen.queryByText(/Share this server with your devices/)).toBeNull()
})
