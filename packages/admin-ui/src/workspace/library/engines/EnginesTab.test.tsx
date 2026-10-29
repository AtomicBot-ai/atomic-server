import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '@contract'
import { EnginesTab } from './EnginesTab'

// One status line for both clients (`engineStatus`): the terminal's engine list says the same (B08).
it('says what is installed, installing and offered as an update', () => {
  render(
    <EnginesTab
      engines={[
        {
          engine: 'llamacpp-upstream',
          active: { version: 'b11946', variant: 'cpu' },
          update: { needed: true, target: { version: 'b12000' } },
        },
        { engine: 'mlx' },
      ]}
      snapshot={
        {
          downloads: [{ kind: 'engine', engine: 'mlx', stage: 'downloading', transferred: 25, total: 100 }],
          engines: [],
        } as unknown as WorkspaceSnapshot
      }
      loading={false}
      onSettings={vi.fn()}
    />
  )
  expect(screen.getByText('Installed · b11946 · cpu · update b12000')).toBeInTheDocument()
  expect(screen.getByText('Installing · 25%')).toBeInTheDocument()
})
