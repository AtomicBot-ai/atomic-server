/** Settings → Account is listed and shown only while accounts are on (`snapshot.account.enabled`). */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { accountFixture } from '@/test/account-fixture'
import { workspaceFixture } from '@/test/workspace-fixture'
import { WorkspaceNavigation } from '../WorkspaceNavigation'
import { Settings } from '../server/settings/Settings'

const navigation = (account = accountFixture()) => {
  const selectSection = vi.fn()
  render(
    <WorkspaceNavigation
      page="settings"
      section="admin"
      task="chat"
      workspace={workspaceFixture({}, { account }).workspace}
      navigate={vi.fn()}
      selectSection={selectSection}
      selectTask={vi.fn()}
      connectAgent={vi.fn()}
      openHelp={vi.fn()}
    />
  )
  return { nav: within(screen.getByRole('navigation', { name: 'Settings sections' })), selectSection }
}

it('lists Account after Hardware while accounts are on', async () => {
  const { nav, selectSection } = navigation()
  const labels = nav.getAllByRole('button').map((button) => button.textContent)
  expect(labels.slice(labels.indexOf('Hardware'), labels.indexOf('Hardware') + 2)).toEqual([
    'Hardware',
    'Account',
  ])
  await userEvent.click(nav.getByRole('button', { name: 'Account' }))
  expect(selectSection).toHaveBeenCalledWith('account')
})

it('does not list Account while accounts are off', () => {
  const { nav } = navigation(accountFixture({ enabled: false }))
  expect(nav.queryByRole('button', { name: 'Account' })).toBeNull()
})

it('opens the Account page, or General in its place while accounts are off', async () => {
  const on = workspaceFixture({}, { account: accountFixture() }).workspace
  const page = render(
    <Settings workspace={on} section="account" openCommand={vi.fn()} openEngines={vi.fn()} />
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account')
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  page.unmount()
  const off = workspaceFixture({}, { account: accountFixture({ enabled: false }) }).workspace
  render(<Settings workspace={off} section="account" openCommand={vi.fn()} openEngines={vi.fn()} />)
  // General reads the configuration on mount.
  await act(async () => {})
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('General')
  expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
})
