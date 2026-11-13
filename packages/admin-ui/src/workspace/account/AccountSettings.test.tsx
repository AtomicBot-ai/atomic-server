/** Settings → Account: the email and device sign-ins against a mocked execute, and signing out. */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_POLL_MS } from '@view'
import { accountFixture, liveAccount } from '@/test/account-fixture'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AccountSettings } from './AccountSettings'

const signedIn = { signed_in: true, user: { email: 'ann@example.com', display_name: null } }
const device = {
  state: 'device' as const,
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://atomic.example/activate',
  verification_uri_complete: 'https://atomic.example/activate?code=WDJB-MJHT',
  expires_at: Date.now() + 600_000,
}

afterEach(() => vi.useRealTimers())

describe('Settings → Account', () => {
  it('shows nothing while accounts are off', () => {
    expect(
      render(<AccountSettings workspace={workspaceFixture({}).workspace} />).container
    ).toBeEmptyDOMElement()
    const off = liveAccount(accountFixture({ enabled: false }))
    expect(render(<AccountSettings workspace={off.workspace()} />).container).toBeEmptyDOMElement()
  })

  it('signs in with an emailed code, with errors inline', async () => {
    let attempts = 0
    const live = liveAccount(accountFixture(), {
      'account.signin.email.start': (_input, update) =>
        update({
          sign_in: { state: 'email_sent', expires_at: Date.now() + 600_000, resend_at: Date.now() + 60_000 },
        }),
      'account.signin.email.verify': (_input, update) => {
        if (++attempts === 1) throw new Error('Wrong code; 4 attempts left.')
        update({ ...signedIn, sign_in: { state: 'idle' } })
      },
    })
    render(<live.Live>{(w) => <AccountSettings workspace={w} />}</live.Live>)
    await userEvent.type(screen.getByLabelText('Email'), 'ann')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(live.execute).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Email'), '@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(live.execute).toHaveBeenCalledWith('account.signin.email.start', { email: 'ann@example.com' })
    expect(await screen.findByText('Enter the 6-digit code we sent to ann@example.com.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send a new code in/ })).toBeDisabled()
    const code = screen.getByLabelText('Code')
    await userEvent.type(code, '12 34 56')
    expect(code).toHaveValue('123456')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong code; 4 attempts left.')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(live.execute).toHaveBeenLastCalledWith('account.signin.email.verify', { code: '123456' })
    expect(await screen.findByText('Signed in as ann@example.com')).toBeInTheDocument()
  })

  it('shows the service’s refusal under the email field', async () => {
    const live = liveAccount(accountFixture(), {
      'account.signin.email.start': () => {
        throw new Error('The account service cannot send email right now.')
      },
    })
    render(<live.Live>{(w) => <AccountSettings workspace={w} />}</live.Live>)
    await userEvent.type(screen.getByLabelText('Email'), 'ann@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot send email right now')
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.com')
  })

  it('goes back to the email field to use another address', async () => {
    const sent = { state: 'email_sent' as const, expires_at: Date.now() + 600_000, resend_at: 0 }
    const live = liveAccount(accountFixture({ sign_in: sent }), {
      'account.signin.cancel': (_input, update) => update({ sign_in: { state: 'idle' } }),
    })
    render(<live.Live>{(w) => <AccountSettings workspace={w} />}</live.Live>)
    expect(screen.getByText('Enter the 6-digit code from the sign-in email.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(live.execute).toHaveBeenCalledWith('account.signin.cancel')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  })

  it('signs in on another device: shows the code, opens the page, polls, and cancels', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const live = liveAccount(accountFixture(), {
      'account.signin.device.start': (_input, update) => {
        update({ sign_in: device })
        return device
      },
      'account.signin.cancel': (_input, update) => update({ sign_in: { state: 'idle' } }),
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<live.Live>{(w) => <AccountSettings workspace={w} />}</live.Live>)
    await user.click(screen.getByRole('button', { name: 'Sign in on another device' }))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(device.verification_uri_complete, '_blank', 'noopener,noreferrer')
    )
    expect(await screen.findByLabelText('Sign-in code')).toHaveTextContent('WDJB-MJHT')
    expect(screen.getByRole('link', { name: device.verification_uri })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('timer')).toHaveTextContent(/The code expires in \d+:\d\d/)
    live.refresh.mockClear()
    await act(async () => vi.advanceTimersByTime(ACCOUNT_POLL_MS))
    expect(live.refresh).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(live.execute).toHaveBeenCalledWith('account.signin.cancel')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    live.refresh.mockClear()
    await act(async () => vi.advanceTimersByTime(ACCOUNT_POLL_MS * 2))
    expect(live.refresh).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('moves on once the other device approves, and says why a device sign-in failed', async () => {
    const live = liveAccount(accountFixture({ sign_in: device }))
    render(<live.Live>{(w) => <AccountSettings workspace={w} />}</live.Live>)
    act(() =>
      live.update({ sign_in: { state: 'failed', reason: 'denied', message: 'The sign-in was declined.' } })
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The sign-in was declined.')
    expect(screen.getByRole('button', { name: 'Sign in on another device' })).toBeInTheDocument()
    act(() => live.update({ ...signedIn, sign_in: { state: 'idle' } }))
    expect(screen.getByText('Signed in as ann@example.com')).toBeInTheDocument()
  })

  it('signs out only after a warning that every device loses access', async () => {
    const live = liveAccount(
      accountFixture({ ...signedIn, user: { email: 'ann@example.com', display_name: 'Ann' } }),
      { 'account.signout': (_input, update) => update({ signed_in: false, user: null }) }
    )
    const openRemote = vi.fn()
    render(<live.Live>{(w) => <AccountSettings workspace={w} openRemote={openRemote} />}</live.Live>)
    expect(screen.getByText('Signed in as Ann')).toBeInTheDocument()
    expect(screen.getByText('ann@example.com')).toBeInTheDocument()
    expect(screen.getByText('Not shared with your devices')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Manage devices' }))
    expect(openRemote).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out of this account?' })
    expect(dialog).toHaveTextContent('Every device that uses this server loses access')
    expect(live.execute).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(live.execute).toHaveBeenCalledWith('account.signout'))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  })
})
