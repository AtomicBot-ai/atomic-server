/** Navigation names and order shared by the terminal and browser workspaces. */
export const WORKSPACE_NAVIGATION = [
  { id: 'playground', label: 'Playground' },
  { id: 'server', label: 'Server' },
  { id: 'catalog', label: 'Engines & Models' },
] as const

export const SERVER_SECTIONS = [
  { id: 'connect', label: 'Connect' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'diagnostics', label: 'Diagnostics' },
] as const

export const LIBRARY_SECTIONS = [
  { id: 'installed', label: 'Installed' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'engines', label: 'Engines' },
  { id: 'downloads', label: 'Downloads' },
] as const

export const PLAYGROUND_TASKS = [
  { id: 'chat', label: 'Chat & vision' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'embedding', label: 'Embeddings' },
  { id: 'decision', label: 'Decisions' },
  { id: 'router', label: 'Router' },
] as const
