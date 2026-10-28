import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/** `.hub-menu`'s width and the room it keeps from the window's edge, in CSS pixels. */
const MENU_WIDTH = 240,
  EDGE = 16

/**
 * Which side of its button a menu opens toward: under the button's right edge (`end`) while that keeps
 * it in the window, else under its left edge. A wrapped toolbar puts a button at either edge.
 */
export function menuAlign(anchor: { left: number; right: number }, viewport: number): 'start' | 'end' {
  if (anchor.right - MENU_WIDTH >= EDGE) return 'end'
  return anchor.left + MENU_WIDTH <= viewport - EDGE ? 'start' : 'end'
}

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
    const anchor = panel?.parentElement
    if (panel && anchor) panel.dataset.align = menuAlign(anchor.getBoundingClientRect(), window.innerWidth)
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
