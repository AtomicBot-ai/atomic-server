/** The Add a device dialog on a fake clock: the QR image, the code, its countdown, renewal and closing. */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_POLL_MS } from '@view'
import type { AccountPairingCode } from '@contract'
import { accountFixture, liveAccount, remoteFixture } from '@/test/account-fixture'
import { AddDeviceDialog } from './AddDeviceDialog'

const START = Date.UTC(2026, 10, 12, 10)
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path d="M0 0h7v7H0z"/></svg>'
const code = (patch: Partial<AccountPairingCode> = {}): AccountPairingCode => ({
  code: 'BCDF-GHJK',
  link: 'atomic-chat://remote/pair?c=BCDF-GHJK&k=secret',
  expires_at: START + 600_000,
  qr_svg: svg,
  ...patch,
})
const sharing = () =>
  accountFixture({
    signed_in: true,
    user: { email: 'ann@example.com', display_name: null },
    remote: remoteFixture({
      sharing: true,
      tunnel: 'online',
      addresses: 1,
      pairing: { expires_at: START + 600_000 },
    }),
  })

function open(answer: Parameters<typeof liveAccount>[1] = {}) {
  const live = liveAccount(sharing(), answer)
  const onClose = vi.fn()
  const onPaired = vi.fn()
  render(
    <live.Live>
      {(w) => <AddDeviceDialog workspace={w} pairing={code()} onClose={onClose} onPaired={onPaired} />}
    </live.Live>
  )
  return { live, onClose, onPaired }
}

const tick = (ms: number) => act(async () => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})
afterEach(() => vi.useRealTimers())

describe('Add a device', () => {
  it('shows the server’s QR code as an image, never as markup, with the code and a link to copy', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    open()
    const qr = screen.getByRole('img', { name: 'QR code of the pairing link' })
    expect(qr).toHaveAttribute('src', `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    expect(document.querySelector('.add-device-dialog svg path')).toBeNull()
    expect(screen.getByLabelText('Pairing code')).toHaveTextContent('BCDF-GHJK')
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await tick(0)
    expect(writeText).toHaveBeenCalledWith('atomic-chat://remote/pair?c=BCDF-GHJK&k=secret')
  })

  it('counts down, offers a new code once expired, and counts the new one down', async () => {
    const { live } = open({
      'account.remote.pairing.open': () => code({ code: 'LMNP-QRST', expires_at: Date.now() + 600_000 }),
    })
    expect(screen.getByRole('timer')).toHaveTextContent('Expires in 10:00')
    await tick(1_000)
    expect(screen.getByRole('timer')).toHaveTextContent('Expires in 9:59')
    expect(screen.queryByRole('button', { name: 'New code' })).toBeNull()
    await tick(599_000)
    expect(screen.getByRole('timer')).toHaveTextContent('This code has expired.')
    fireEvent.click(screen.getByRole('button', { name: 'New code' }))
    await tick(0)
    expect(live.execute).toHaveBeenCalledWith('account.remote.pairing.open')
    expect(screen.getByLabelText('Pairing code')).toHaveTextContent('LMNP-QRST')
    expect(screen.getByRole('timer')).toHaveTextContent('Expires in 10:00')
    expect(screen.queryByRole('button', { name: 'New code' })).toBeNull()
  })

  it('reads the snapshot every few seconds while the code is open, and stops once it expired', async () => {
    const { live } = open()
    await tick(ACCOUNT_POLL_MS)
    expect(live.refresh).toHaveBeenCalledTimes(1)
    await tick(600_000)
    live.refresh.mockClear()
    await tick(ACCOUNT_POLL_MS * 3)
    expect(live.refresh).not.toHaveBeenCalled()
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('closes the unused code on %s', async (_how, close) => {
    const { live, onClose } = open()
    close()
    await tick(0)
    expect(onClose).toHaveBeenCalled()
    expect(live.execute).toHaveBeenCalledWith('account.remote.pairing.close')
  })

  it('closes itself once a new device has access, leaving the used code alone', async () => {
    const existing = { grant_id: 'old', device_name: 'Old laptop', platform: 'linux', since: START - 1 }
    const live = liveAccount(
      accountFixture({ ...sharing(), remote: { ...sharing().remote, devices: [existing] } })
    )
    const onClose = vi.fn()
    const onPaired = vi.fn()
    render(
      <live.Live>
        {(w) => <AddDeviceDialog workspace={w} pairing={code()} onClose={onClose} onPaired={onPaired} />}
      </live.Live>
    )
    expect(onPaired).not.toHaveBeenCalled()
    act(() =>
      live.update({
        remote: {
          ...sharing().remote,
          devices: [existing, { grant_id: 'new', device_name: null, platform: 'ios', since: START }],
        },
      })
    )
    expect(onPaired).toHaveBeenCalledWith('iOS')
    expect(onPaired).toHaveBeenCalledTimes(1)
    expect(live.execute).not.toHaveBeenCalledWith('account.remote.pairing.close')
  })
})
