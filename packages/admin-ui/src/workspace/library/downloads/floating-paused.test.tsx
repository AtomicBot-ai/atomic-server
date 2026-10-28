import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FloatingDownloads } from './FloatingDownloads'

// E2E B02: the shared card said "cancelled" while the Downloads list said Paused.
it('calls a paused download Paused on the shared card', () => {
  const { workspace } = workspaceFixture(
    {},
    { setups: [{ id: 'job', stage: 'cancelled', plan: { model_id: 'Model', total_download_bytes: 100 } }] }
  )
  render(<FloatingDownloads workspace={workspace} />)
  const card = screen.getByRole('button', { name: 'View downloads' })
  expect(card).toHaveTextContent('Paused')
  expect(card).not.toHaveTextContent('cancelled')
})
