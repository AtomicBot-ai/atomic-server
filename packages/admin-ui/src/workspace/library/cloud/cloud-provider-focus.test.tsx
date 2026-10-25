import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CloudProviders } from './CloudProviders'

it.each([false, true])(
  'restores a failed provider field only when focus has not moved elsewhere: %s',
  async (moved) => {
    let reject!: (reason: Error) => void
    const { workspace } = workspaceFixture({
      'cloud.list': { providers: [] },
      'cloud.connect': () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    })
    render(
      <>
        <CloudProviders workspace={workspace} onboarding />
        <button>Other control</button>
      </>
    )
    await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
    const key = screen.getByLabelText('API key', { exact: false })
    await userEvent.type(key, 'invalid-key')
    await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
    if (moved) await userEvent.click(screen.getByRole('button', { name: 'Other control' }))
    else (document.activeElement as HTMLElement).blur()
    await act(async () => reject(new Error('The provider rejected this API key.')))
    expect(screen.getByRole('alert')).toHaveTextContent('rejected this API key')
    expect(moved ? screen.getByRole('button', { name: 'Other control' }) : key).toHaveFocus()
    expect(key).toHaveValue('invalid-key')
  }
)
