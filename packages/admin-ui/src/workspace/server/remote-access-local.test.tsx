import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { RemoteAccess } from './RemoteAccess'

// "Local network" is about the address the API listens on: an API running on loopback is not
// stopped, it is local only; only an API that is down reads Stopped.
it.each([
  [true, '127.0.0.1', 'Local only (127.0.0.1:1337): other devices cannot reach it'],
  [true, '0.0.0.0', 'Listening on 0.0.0.0:1337 for devices on this network'],
  [false, '127.0.0.1', 'Stopped: the API is not running'],
])('says what the API on host %s (running: %s) means for the network', (running, host, expected) => {
  const { workspace } = workspaceFixture({})
  workspace.snapshot!.api = { ...workspace.snapshot!.api, running, host, port: 1337 }
  render(<RemoteAccess workspace={workspace} />)
  const panel = screen.getByRole('heading', { name: 'Local network' }).closest('section')!
  expect(panel.querySelector('[role="status"]')).toHaveTextContent(expected)
})
