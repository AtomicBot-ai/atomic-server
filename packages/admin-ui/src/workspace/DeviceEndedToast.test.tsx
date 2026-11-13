/** The notice that a device disconnected from its side: the newest, how many more, dismissed per entry. */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import type { AccountRemoteEnded } from '@contract'
import { accountFixture, liveAccount, remoteFixture } from '@/test/account-fixture'
import { DeviceEndedToast } from './DeviceEndedToast'

const ended = (grant_id: string, device_name: string | null, at: number): AccountRemoteEnded => ({
  grant_id,
  device_name,
  platform: 'ios',
  at,
})

it('names the newest device that disconnected and how many more, until dismissed', async () => {
  const live = liveAccount(
    accountFixture({ remote: remoteFixture({ ended: [ended('b', 'Pixel', 2), ended('a', null, 1)] }) })
  )
  render(<live.Live>{(w) => <DeviceEndedToast workspace={w} />}</live.Live>)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Device disconnectedPixel disconnected from this server (and 1 more). It pairs again to use it.'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('status')).toBeNull()
  // A newer one comes back; the dismissed ones stay away.
  act(() =>
    live.update({
      remote: remoteFixture({
        ended: [ended('c', 'MacBook', 3), ended('b', 'Pixel', 2), ended('a', null, 1)],
      }),
    })
  )
  expect(screen.getByRole('status')).toHaveTextContent('MacBook disconnected from this server. It pairs')
})

it('says nothing while accounts are off', () => {
  const live = liveAccount(
    accountFixture({ enabled: false, remote: remoteFixture({ ended: [ended('a', 'Pixel', 1)] }) })
  )
  render(<live.Live>{(w) => <DeviceEndedToast workspace={w} />}</live.Live>)
  expect(screen.queryByRole('status')).toBeNull()
})
