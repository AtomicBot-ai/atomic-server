import { useState } from 'react'
export const CHAT_DEFAULTS = {
  sendOnEnter: true,
  autoScroll: true,
  markdown: true,
  showStats: true,
  showSystem: false,
  rawNames: false,
  sidebar: true,
  theme: 'dark',
  fontSize: 14,
  codeHeight: 320,
  system: '',
  parameters: '{}',
  favorites: [] as string[],
  presets: [] as { name: string; system: string; parameters: string }[],
}
export type ChatPreferences = typeof CHAT_DEFAULTS
const KEY = 'atomic:playground:preferences:v1'
export function validPreferences(value: unknown): ChatPreferences {
  const result = { ...CHAT_DEFAULTS },
    data = value as Record<string, unknown> | null
  if (!data || typeof data !== 'object') throw new Error('Choose an Atomic Playground preferences file.')
  for (const key of [
    'sendOnEnter',
    'autoScroll',
    'markdown',
    'showStats',
    'showSystem',
    'rawNames',
    'sidebar',
  ] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key]
  if (data.theme === 'dark' || data.theme === 'light' || data.theme === 'system') result.theme = data.theme
  for (const key of ['fontSize', 'codeHeight'] as const) {
    const n = Number(data[key])
    if (Number.isFinite(n))
      result[key] = Math.max(key === 'fontSize' ? 12 : 100, Math.min(key === 'fontSize' ? 24 : 1200, n))
  }
  for (const key of ['system', 'parameters'] as const)
    if (typeof data[key] === 'string') result[key] = data[key].slice(0, 100000)
  if (Array.isArray(data.favorites))
    result.favorites = data.favorites.filter((v): v is string => typeof v === 'string').slice(0, 100)
  if (Array.isArray(data.presets))
    result.presets = data.presets
      .filter(
        (v) =>
          v && typeof v.name === 'string' && typeof v.system === 'string' && typeof v.parameters === 'string'
      )
      .slice(0, 50)
  return result
}
export function useChatPreferences() {
  const [preferences, set] = useState(() => {
    try {
      return validPreferences(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
    } catch {
      return { ...CHAT_DEFAULTS }
    }
  })
  const save = (value: ChatPreferences) => {
    const next = validPreferences(value)
    localStorage.setItem(KEY, JSON.stringify(next))
    set(next)
  }
  return { preferences, save }
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
