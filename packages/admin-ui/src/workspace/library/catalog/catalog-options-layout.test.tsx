import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { CatalogModelOptions } from './CatalogModelOptions'
import { CatalogMedia } from './CatalogMedia'

it('preserves media variant labels, known file sizes and recommendations while selecting the original ID', async () => {
  const choose = vi.fn()
  render(
    <CatalogModelOptions
      category="video"
      execute={vi.fn()}
      choose={choose}
      model={{
        id: 'ltx',
        name: 'LTX',
        source: {
          transformer: {
            quants: [
              { id: 'q4_k_m', label: 'Q4_K_M', bytes: 2 ** 30, recommended: true },
              { id: 'q8_0', label: 'Q8_0', bytes: 2 ** 31 },
            ],
          },
        },
      }}
    />
  )
  const variants = screen.getByRole('list', { name: 'Download variants' })
  const first = within(variants).getAllByRole('listitem')[0]!
  expect(within(first).getByText('Q4_K_M')).toBeInTheDocument()
  expect(within(first).getByText('1.0 GiB')).toBeInTheDocument()
  expect(within(first).getByText('Recommended')).toBeInTheDocument()
  expect(screen.getByText(/Additional components/)).toBeInTheDocument()
  await userEvent.click(within(first).getByRole('button', { name: 'Download', exact: true }))
  expect(choose).toHaveBeenCalledWith(expect.objectContaining({ selectedQuant: 'q4_k_m' }))
})

it('keeps GGUF filenames and sizes in labelled rows and selects the exact file', async () => {
  const choose = vi.fn()
  render(
    <CatalogModelOptions
      category="text"
      execute={vi
        .fn()
        .mockResolvedValue([
          { filename: 'Long-Model-Q4_K_M.gguf', size: 2 ** 30 },
          { filename: 'Long-Model-Q8_0.gguf' },
        ])}
      choose={choose}
      model={{ id: 'repo/model', source: { format: 'gguf' } }}
    />
  )
  const variants = await screen.findByRole('list', { name: 'Download variants' })
  const entries = within(variants).getAllByRole('listitem')
  expect(within(entries[0]!).getByText('1.0 GiB')).toBeInTheDocument()
  expect(within(entries[1]!).getByText('Size unavailable')).toBeInTheDocument()
  await userEvent.click(within(entries[1]!).getByRole('button', { name: 'Download', exact: true }))
  expect(choose).toHaveBeenCalledWith(expect.objectContaining({ selectedFile: 'Long-Model-Q8_0.gguf' }))
})

it('shows a single default download without pretending the file size is known', async () => {
  const choose = vi.fn()
  render(
    <CatalogModelOptions
      model={{ id: 'laya', name: 'Laya' }}
      category="decision"
      execute={vi.fn()}
      choose={choose}
    />
  )
  expect(screen.getByText('Default')).toBeInTheDocument()
  expect(screen.getByText('Size unavailable')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(choose).toHaveBeenCalledWith({ id: 'laya', name: 'Laya' })
})

it('connects a media disclosure to its detail and keeps its engine, variant count and attribution visible', () => {
  render(
    <CatalogMedia
      models={[
        {
          id: 'audio',
          name: 'Sound',
          source: { engines: ['audio-cpp'], quants: ['q8_0'] },
          attribution: 'Powered by Stability AI',
        },
      ]}
      expanded="audio"
      onExpand={vi.fn()}
      isInstalled={() => false}
      detail={() => <p>Details</p>}
    />
  )
  const button = screen.getByRole('button', { name: 'Sound', exact: true })
  const panel = screen.getByRole('region', { name: 'Sound', exact: true })
  expect(button).toHaveAttribute('aria-controls', panel.id)
  expect(screen.getByText('1 variant')).toBeInTheDocument()
  expect(screen.getByText('Powered by Stability AI')).toBeInTheDocument()
})

it('shows only the empty state when a GGUF repository has no files', async () => {
  render(
    <CatalogModelOptions
      model={{ id: 'empty/repo' }}
      category="text"
      execute={vi.fn().mockResolvedValue([])}
      choose={vi.fn()}
    />
  )
  expect(await screen.findByText('No GGUF files available')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Download options' })).toBeNull()
})
