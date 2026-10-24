import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { RuntimeSettings } from './RuntimeSettings'
import { ServerConfiguration } from './ServerConfiguration'

it.each(['admin', 'api'])(
  'releases the focused %s port before wheel scrolling can step its value',
  async (kind) => {
    const { workspace, execute } = workspaceFixture({
      'config.get': {
        values: { admin: { port: 1338 }, api: { host: '127.0.0.1', port: 1337, prefix: '/v1' } },
        fields: [{ path: 'admin.port', type: 'number', min: 0, max: 65535 }],
      },
    })
    render(
      kind === 'admin' ? (
        <RuntimeSettings workspace={workspace} section="admin" />
      ) : (
        <ServerConfiguration workspace={workspace} />
      )
    )
    if (kind === 'admin') await userEvent.click(await screen.findByText('Advanced settings'))
    const port = await screen.findByLabelText(kind === 'admin' ? 'Admin port' : 'Port')
    await userEvent.clear(port)
    await userEvent.type(port, '1338.5')
    expect(port).toHaveFocus()
    fireEvent.wheel(port, { deltaY: 100 })
    expect(port).not.toHaveFocus()
    expect(port).toHaveValue(1338.5)
    expect(port).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(execute).not.toHaveBeenCalledWith('config.update', expect.anything())
  }
)
