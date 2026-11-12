/** Dark by default; a `dark` class on `<html>` and one localStorage key, no theme library. */

import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'atc-admin:theme'

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  html.classList.toggle('dark', theme === 'dark')
  html.style.colorScheme = theme
}

interface ThemeState {
  theme: Theme
  setTheme(theme: Theme): void
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: 'dark',
  setTheme(theme) {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* private mode: the choice lasts for the page */
    }
    set({ theme })
  },
}))

/** Before the first render: the stored choice, dark when there is none. */
export function applyStoredTheme() {
  useThemeStore.getState().setTheme(readStored())
}
