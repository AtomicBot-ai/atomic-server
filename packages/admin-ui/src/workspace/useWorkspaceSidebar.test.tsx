import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { useWorkspaceSidebar } from './useWorkspaceSidebar'

const resize = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  fireEvent(window, new Event('resize'))
}
afterEach(() => resize(1024))
function Sidebar() {
  const sidebar = useWorkspaceSidebar()
  return (
    <>
      <button onClick={sidebar.toggle} aria-expanded={sidebar.expanded}>
        Toggle sidebar
      </button>
      <button onClick={sidebar.reveal}>Models</button>
      <button onClick={() => sidebar.setSidebarOpen(false)}>Open section</button>
    </>
  )
}

it('collapses the desktop sidebar by keyboard and reopens it from the navigation rail', async () => {
  resize(1280)
  render(<Sidebar />)
  const toggle = screen.getByRole('button', { name: 'Toggle sidebar' })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await userEvent.tab()
  await userEvent.keyboard('{Enter}')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(screen.getByRole('button', { name: 'Models' }))
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
})

it('keeps the compact drawer separate from the desktop collapsed preference across resize', async () => {
  resize(1280)
  render(<Sidebar />)
  const toggle = screen.getByRole('button', { name: 'Toggle sidebar' })
  await userEvent.click(toggle)
  resize(700)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Open section' }))
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  resize(1280)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
})
