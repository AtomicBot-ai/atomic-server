import { WORKSPACE_NAVIGATION } from '../../contract/index.js'
const PAGE_IDS = { playground: 'chat', server: 'server', catalog: 'models', settings: 'access' } as const
const PAGE_KEYS = { playground: 'c', server: 'v', catalog: 'm', settings: 's' } as const
export const PAGES: { id: Page; name: string; key: string; hint: string }[] = WORKSPACE_NAVIGATION.map(
  (p, i) => ({
    id: PAGE_IDS[p.id],
    name: p.label,
    key: PAGE_KEYS[p.id],
    hint: `Alt+${i + 1} ${p.label}`,
  })
)

export type Page =
  | 'setup'
  | 'history'
  | 'keys'
  | 'welcome'
  | 'chat'
  | 'server'
  | 'models'
  | 'settings'
  | 'requests'
  | 'access'
  | 'logs'
  | 'checks'
  | 'commands'
  | 'tools'
export const PAGE_FOCUS: Record<Page, string> = {
  welcome: 'hosting',
  tools: 'operation-select',
  setup: 'setup-refresh',
  chat: 'composer',
  server: 'api-toggle',
  models: 'library:catalog',
  settings: 'endpoint',
  history: 'history-search',
  keys: 'key-new',
  requests: 'refresh',
  access: 'section-menu',
  logs: 'log-filter',
  checks: 'checks',
  commands: 'command:0',
}
