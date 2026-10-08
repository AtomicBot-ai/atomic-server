import type { Conversation, ConversationSummary, ClientKeyView } from '../../terminal-data/index.js'
import type { SetupView } from '../../terminal-setup/index.js'
import type { AgentId } from '../../agent-launch/index.js'
import type { ChatMessage, RequestRow } from '../../terminal-service/index.js'
import type { CommandRow } from '../command-list.js'
import type { TuiState } from '../state.js'
import { initialState } from '../state.js'
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
export const PAGE_FOCUS: Record<Page, string> = {
  welcome: 'personal',
  setup: 'setup-refresh',
  chat: 'composer',
  server: 'api-toggle',
  models: 'install-models',
  settings: 'endpoint',
  history: 'history-search',
  keys: 'key-new',
  requests: 'refresh',
  access: 'page:keys',
  logs: 'log-filter',
  checks: 'checks',
  commands: 'command:0',
}
export interface WorkspaceState {
  setup: SetupView | null
  setupComplete: boolean
  conversation: Conversation | null
  history: ConversationSummary[]
  historyFilter: string
  clientKeys: ClientKeyView[]
  secret: string
  installed: { id: string; provider: string; name: string }[]
  modelsUpdated: number
  modelsError: string
  agent: AgentId
  agentModel: string
  commands: CommandRow[]
  base: TuiState
  page: Page
  overlay:
    | 'help'
    | 'endpoint'
    | 'stop'
    | 'detail'
    | 'examples'
    | 'menu'
    | 'command'
    | 'agent'
    | 'revoke-key'
    | 'delete-chat'
    | 'credential'
    | null
  focus: string
  hover: string
  message: string
  draft: string
  cursor: number
  edit: string
  editValue: string
  endpoint: string
  model: string
  models: string[]
  messages: ChatMessage[]
  generating: boolean
  motion: boolean
  mouse: boolean
  requests: RequestRow[]
  selected: number
  scroll: number
  busy: boolean
  ready: boolean
}
export function createWorkspace(page: Page = 'welcome'): WorkspaceState {
  return {
    setup: null,
    setupComplete: false,
    conversation: null,
    history: [],
    historyFilter: '',
    clientKeys: [],
    secret: '',
    installed: [],
    modelsUpdated: 0,
    modelsError: '',
    agent: 'atomic-agent',
    agentModel: '',
    commands: [],
    base: initialState(),
    page,
    overlay: null,
    focus: PAGE_FOCUS[page],
    hover: '',
    message: '',
    draft: '',
    cursor: 0,
    edit: '',
    editValue: '',
    endpoint: 'http://127.0.0.1:1337/v1',
    model: '',
    models: [],
    messages: [],
    generating: false,
    motion: true,
    mouse: true,
    requests: [],
    selected: 0,
    scroll: 0,
    busy: false,
    ready: false,
  }
}
export const PAGES: { id: Page; name: string; key: string; hint: string }[] = [
  { id: 'chat', name: 'Chat', key: 'c', hint: 'Start a conversation. Ctrl+G then C' },
  { id: 'server', name: 'Server', key: 's', hint: 'Manage the API and inspect requests. Ctrl+G then S' },
  {
    id: 'models',
    name: 'Models',
    key: 'm',
    hint: 'Choose a model from the connected endpoint. Ctrl+G then M',
  },
  {
    id: 'settings',
    name: 'Settings',
    key: ',',
    hint: 'Connection, display, and server preferences. Ctrl+G then comma',
  },
]
