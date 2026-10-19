import { WORKSPACE_NAVIGATION } from '../../contract/index.js'
import type { LibraryRow, LibraryView } from './library/library-model.js'
import type { WorkspaceSnapshot, WorkspaceOperation } from '../../contract/index.js'
import type { Conversation, ConversationSummary, ClientKeyView } from '../../terminal-data/index.js'
import type { SetupView, EngineChoice } from '../../terminal-setup/index.js'
import type { AgentId } from '../../agent-launch/index.js'
import type { ChatImage, ChatMessage, RequestRow } from '../../terminal-service/index.js'
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
  | 'tools'
export const PAGE_FOCUS: Record<Page, string> = {
  welcome: 'hosting',
  tools: 'operation-select',
  setup: 'setup-refresh',
  chat: 'composer',
  server: 'api-toggle',
  models: 'library:installed',
  settings: 'endpoint',
  history: 'history-search',
  keys: 'key-new',
  requests: 'refresh',
  access: 'tools:runtime',
  logs: 'log-filter',
  checks: 'checks',
  commands: 'command:0',
}
export interface WorkspaceState {
  setupGoal: string
  libraryView: LibraryView
  libraryCategory: string
  libraryRows: LibraryRow[]
  libraryQuery: string
  libraryPlan: Record<string, unknown> | null
  libraryRequest: Record<string, unknown>
  workspace: WorkspaceSnapshot | null
  operations: WorkspaceOperation[]
  toolGroup: string
  operation: string
  operationInput: string
  operationResult: string
  operationChoices: string[]
  operationField: string
  operationReturn: Page
  consoleInput: string
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
  engine: string
  engines: EngineChoice[]
  pickerBusy: boolean
  pickerError: string
  agent: AgentId
  agentModel: string
  commands: CommandRow[]
  base: TuiState
  page: Page
  overlay:
    | 'engine-picker'
    | 'model-picker'
    | 'workspace'
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
    | 'operation-choice'
    | 'console'
    | 'agent-setup'
    | 'install-review'
    | 'images'
    | 'setup-goal'
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
  images: ChatImage[]
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
    setupGoal: 'chat',
    libraryView: 'installed',
    libraryCategory: 'text',
    libraryRows: [],
    libraryQuery: '',
    libraryPlan: null,
    libraryRequest: {},
    workspace: null,
    operations: [],
    toolGroup: 'server',
    operation: '',
    operationInput: '{}',
    operationResult: '',
    operationChoices: [],
    operationField: '',
    operationReturn: 'server',
    consoleInput: '',
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
    engine: '',
    engines: [],
    pickerBusy: false,
    pickerError: '',
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
    images: [],
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
const PAGE_IDS = { playground: 'chat', server: 'server', catalog: 'models' } as const
const PAGE_KEYS = { playground: 'c', server: 's', catalog: 'm' } as const
export const PAGES: { id: Page; name: string; key: string; hint: string }[] = WORKSPACE_NAVIGATION.map(
  (p, i) => ({
    id: PAGE_IDS[p.id],
    name: p.label,
    key: PAGE_KEYS[p.id],
    hint: `Alt+${i + 1} ${p.label}`,
  })
)
