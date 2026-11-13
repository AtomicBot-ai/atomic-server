/** Account → Remote models, "Share with your devices": each state of the account and its devices. */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AccountRemoteDevice, AccountRemoteRequest } from '@contract'
import { accountFixture, liveAccount, remoteFixture } from '@/test/account-fixture'
import { RemoteShare } from './RemoteShare'

const user = { email: 'ann@example.com', display_name: null }
const request: AccountRemoteRequest = {
  grant_id: 'g-req',
  device_name: 'MacBook',
  platform: 'macos',
  client_type: 'desktop',
  check_code: '936468',
  created_at: '2026-11-12T10:00:00Z',
}
const device: AccountRemoteDevice = {
  grant_id: 'g-dev',
  device_name: null,
  platform: 'ios',
  since: Date.UTC(2026, 10, 3, 12),
}
const pairing = {
  code: 'BCDF-GHJK',
  link: 'atomic-chat://remote/pair?c=BCDF-GHJK&k=secret',
  expires_at: Date.now() + 600_000,
  qr_svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
}

describe('Share with your devices', () => {
  it('turns sharing on with the switch, and says why it could not', async () => {
    let calls = 0
    const live = liveAccount(accountFixture({ signed_in: true, user }), {
      'account.remote.share': (input, update) => {
        if (++calls === 1) throw new Error('Devices cannot reach this server: the tunnel did not start.')
        update({ remote: remoteFixture({ sharing: input.enabled === true, tunnel: 'online', addresses: 1 }) })
      },
    })
    render(<live.Live>{(w) => <RemoteShare workspace={w} account={w.snapshot!.account!} />}</live.Live>)
    const toggle = screen.getByRole('switch', { name: 'Share this server' })
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Not shared with your devices')
    expect(screen.getByText('Signed in as ann@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a device' })).toBeNull()
    await userEvent.click(toggle)
    expect(live.execute).toHaveBeenCalledWith('account.remote.share', { enabled: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('the tunnel did not start')
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Shared with your devices over the internet')
    expect(screen.getByRole('button', { name: 'Add a device' })).toBeEnabled()
    await userEvent.click(toggle)
    expect(live.execute).toHaveBeenLastCalledWith('account.remote.share', { enabled: false })
  })

  it('allows or denies a request by its check code and revokes a device after asking', async () => {
    const live = liveAccount(
      accountFixture({
        signed_in: true,
        user,
        remote: remoteFixture({
          sharing: true,
          tunnel: 'online',
          addresses: 1,
          requests: [request],
          devices: [device],
        }),
      })
    )
    render(<live.Live>{(w) => <RemoteShare workspace={w} account={w.snapshot!.account!} />}</live.Live>)
    const asking = within(screen.getByRole('region', { name: 'Asking for access' }))
    expect(asking.getByText('MacBook')).toBeInTheDocument()
    expect(asking.getByText(/macOS ·/)).toHaveTextContent('macOS · Check code 936 468')
    await userEvent.click(asking.getByRole('button', { name: 'Deny MacBook' }))
    expect(live.execute).toHaveBeenCalledWith('account.remote.decide', { grant_id: 'g-req', allow: false })
    await userEvent.click(asking.getByRole('button', { name: 'Allow MacBook' }))
    expect(live.execute).toHaveBeenCalledWith('account.remote.decide', { grant_id: 'g-req', allow: true })
    const devices = within(screen.getByRole('region', { name: 'Devices with access' }))
    expect(devices.getByText('iOS')).toBeInTheDocument()
    expect(devices.getByText('iOS · since Nov 3, 2026')).toBeInTheDocument()
    await userEvent.click(devices.getByRole('button', { name: 'Revoke iOS' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke access?' })
    expect(live.execute).not.toHaveBeenCalledWith('account.remote.revoke', expect.anything())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke access' }))
    await waitFor(() =>
      expect(live.execute).toHaveBeenCalledWith('account.remote.revoke', { grant_id: 'g-dev' })
    )
  })

  it('opens a pairing code in the Add a device dialog and names the device that used it', async () => {
    const live = liveAccount(
      accountFixture({
        signed_in: true,
        user,
        remote: remoteFixture({ sharing: true, tunnel: 'online', addresses: 1 }),
      }),
      { 'account.remote.pairing.open': () => pairing }
    )
    render(<live.Live>{(w) => <RemoteShare workspace={w} account={w.snapshot!.account!} />}</live.Live>)
    expect(screen.getByText('No device has access yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add a device' }))
    expect(live.execute).toHaveBeenCalledWith('account.remote.pairing.open')
    const dialog = await screen.findByRole('dialog', { name: 'Add a device' })
    expect(within(dialog).getByLabelText('Pairing code')).toHaveTextContent('BCDF-GHJK')
    act(() =>
      live.update({
        remote: remoteFixture({
          sharing: true,
          tunnel: 'online',
          addresses: 1,
          devices: [{ ...device, device_name: 'Pixel' }],
        }),
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Pixel can now use this server.')
    expect(live.execute).not.toHaveBeenCalledWith('account.remote.pairing.close')
  })
})
