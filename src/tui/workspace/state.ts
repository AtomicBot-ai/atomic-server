import type { AgentId } from '../../agent-launch/index.js'
import type { ChatMessage, RequestRow } from '../../terminal-service/index.js'
import type { CommandRow } from '../command-list.js'
import type { TuiState } from '../state.js'
import { initialState } from '../state.js'
export type Page =
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
export interface WorkspaceState {
  agent: AgentId
  agentModel: string
  commands: CommandRow[]
  base: TuiState
  page: Page
  overlay: 'help' | 'endpoint' | 'stop' | 'detail' | 'examples' | 'menu' | 'command' | 'agent' | null
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
    agent: 'atomic-agent',
    agentModel: '',
    commands: [],
    base: initialState(),
    page,
    overlay: null,
    focus: page === 'chat' ? 'composer' : '',
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
