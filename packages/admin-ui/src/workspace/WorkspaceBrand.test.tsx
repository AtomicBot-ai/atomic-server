import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { WorkspaceBrand } from './WorkspaceBrand'

it('names the server once without creating another page heading', () => {
  const { container } = render(<WorkspaceBrand />)
  expect(screen.getByText('Atomic Server')).toBeVisible()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  const rays = Array.from(container.querySelectorAll('rect'))
  expect(rays).toHaveLength(4)
  for (const ray of rays) {
    expect(ray).toHaveAttribute('height', '22')
    expect(ray).toHaveAttribute('rx', '11')
  }
})
