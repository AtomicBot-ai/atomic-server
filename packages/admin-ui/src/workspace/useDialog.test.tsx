import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useDialog } from './useDialog'

it('returns to the parent dialog when a successful connection disables its launch card', async () => {
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as unknown as DOMRectList)
  function Provider({ onClose }: { onClose: () => void }) {
    const dialog = useDialog(onClose)
    return (
      <section ref={dialog} role="dialog" aria-modal="true" aria-label="Provider" tabIndex={-1}>
        <button onClick={onClose}>Save connection</button>
      </section>
    )
  }
  function Setup() {
    const [open, setOpen] = useState(false)
    const [connected, setConnected] = useState(false)
    const dialog = useDialog(vi.fn())
    return (
      <>
        <button>Background navigation</button>
        <section ref={dialog} role="dialog" aria-modal="true" aria-label="Setup" tabIndex={-1}>
          <button disabled={connected} onClick={() => setOpen(true)}>
            {connected ? 'Provider connected' : 'Configure provider'}
          </button>
          <button>Continue</button>
          {open && (
            <Provider
              onClose={() => {
                setConnected(true)
                setOpen(false)
              }}
            />
          )}
        </section>
      </>
    )
  }
  try {
    render(<Setup />)
    await userEvent.click(screen.getByRole('button', { name: 'Configure provider' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }))
    expect(screen.getByRole('button', { name: 'Provider connected' })).toBeDisabled()
    expect(screen.getByRole('dialog', { name: 'Setup' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Background navigation' })).not.toHaveFocus()
  } finally {
    rects.mockRestore()
  }
})

it('lets Escape dismiss an inner menu before closing its containing dialog', async () => {
  const close = vi.fn()
  function Setup() {
    const dialog = useDialog(close)
    const [menu, setMenu] = useState(false)
    return (
      <section ref={dialog} role="dialog" aria-modal="true" aria-label="Connection" tabIndex={-1}>
        <button
          onClick={() => setMenu(true)}
          onKeyDown={(event) => {
            if (menu && event.key === 'Escape') {
              event.preventDefault()
              setMenu(false)
            }
          }}
        >
          Choose model
        </button>
        {menu && (
          <div role="listbox" aria-label="Models">
            Model choices
          </div>
        )}
      </section>
    )
  }
  render(<Setup />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose model' }))
  expect(screen.getByRole('listbox', { name: 'Models' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Choose model' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})

it('dismisses only the topmost dialog and consumes the outside click instead of activating the page below', async () => {
  const background = vi.fn(),
    parentClose = vi.fn()
  function Inner({ onClose }: { onClose: () => void }) {
    const ref = useDialog(onClose)
    return (
      <section ref={ref} role="dialog" aria-modal="true" aria-label="Inner" tabIndex={-1}>
        Inner
      </section>
    )
  }
  function Dialogs() {
    const ref = useDialog(parentClose)
    const [inner, setInner] = useState(true)
    return (
      <>
        <button onClick={background}>Background</button>
        <section ref={ref} role="dialog" aria-modal="true" aria-label="Outer" tabIndex={-1}>
          Outer{inner && <Inner onClose={() => setInner(false)} />}
        </section>
      </>
    )
  }
  render(<Dialogs />)
  await userEvent.click(screen.getByRole('button', { name: 'Background' }))
  expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()
  expect(parentClose).not.toHaveBeenCalled()
  expect(background).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Background' }))
  expect(parentClose).toHaveBeenCalledOnce()
  expect(background).not.toHaveBeenCalled()
})
