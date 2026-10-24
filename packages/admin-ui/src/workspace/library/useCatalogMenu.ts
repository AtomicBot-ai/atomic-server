import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/** Native filter inputs with desktop popover keyboard navigation and focus return. */
export function useCatalogMenu() {
  const [menu, setMenu] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const closeMenu = (restore = false) => {
    if (restore) ref.current?.querySelector<HTMLElement>(`[data-menu-trigger="${menu}"]`)?.focus()
    setMenu('')
  }
  useEffect(() => {
    if (!menu) return
    const panel = ref.current?.querySelector<HTMLElement>('.hub-menu')
    const first =
      panel?.querySelector<HTMLElement>('input:checked') ?? panel?.querySelector<HTMLElement>('input, button')
    first?.focus()
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenu('')
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const trigger = target.closest<HTMLElement>('[data-menu-trigger]')
    if (!menu && trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      setMenu(trigger.dataset.menuTrigger ?? '')
      return
    }
    if (!menu) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    if (!target.closest('.hub-menu')) return
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('.hub-menu input, .hub-menu button') ?? []
    )
    const index = items.indexOf(target)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % items.length
            : event.key === 'ArrowUp'
              ? (index - 1 + items.length) % items.length
              : -1
    if (next >= 0) {
      event.preventDefault()
      items[next]?.focus()
    }
  }
  return { menu, setMenu, closeMenu, ref, onKeyDown }
}
