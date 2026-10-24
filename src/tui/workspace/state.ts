import type { FinalSetupState } from './setup/waiting-setup.js'
import type { FeatureEditor } from './server/feature-model.js'
import type { WorkspaceReturnState } from './navigation-return.js'
import { defaultFilters, type CatalogFilters } from './library/catalog-filters.js'
import { initialMedia, type MediaStudioState } from './media/media-model.js'
import type { WaitingGame } from './waiting-game-model.js'
import type { TransferSample } from './download-rates.js'
import type { FirstRunStep, ConnectionDraft, CloudDraft } from '../../contract/index.js'
import type { LibraryFormat } from './library/catalog-actions.js'
import type { EnginePanel } from './library/engine-panel-model.js'
export { PAGES, PAGE_FOCUS } from './workspace-pages.js'
export type { Page } from './workspace-pages.js'
import { PAGE_FOCUS, type Page } from './workspace-pages.js'
import type { LibraryRow, LibraryView } from './library/library-model.js'
import type { WorkspaceSnapshot, WorkspaceOperation } from '../../contract/index.js'
import type { Conversation, ConversationSummary, ClientKeyView } from '../../terminal-data/index.js'
import type { SetupView, EngineChoice } from '../../terminal-setup/index.js'
import type { AgentId } from '../../agent-launch/index.js'
import type { ChatImage, ChatMessage, RequestRow } from '../../terminal-service/index.js'
import type { CommandRow } from '../command-list.js'
import { initialState, type TuiState } from '../state.js'
export interface WorkspaceState extends WorkspaceReturnState {
  downloadAttention?: number
  featureSelection?: string
  featureEditor?: FeatureEditor | undefined
  chatPreferences?: Record<string, unknown> | undefined
  documents?: { name: string; text: string }[] | undefined
  media: MediaStudioState
  waitingGame: WaitingGame | null
  finalSetup?: FinalSetupState | null
  transferSamples: Record<string, TransferSample>
  catalogOpen: string
  catalogVariant: string
  catalogVariants: { label: string; value: string }[]
  catalogMenu: 'category' | 'sort' | 'variants' | 'media-image' | 'media-video' | null
  setupMedia: {
    image: string
    video: string
    errors: Record<string, string>
    request: number
    loading: boolean
  }
  catalogFilters: CatalogFilters
  catalogLikes: string[]
  configDraft: Record<string, string>
  remote: Record<string, unknown>
  cloud: CloudDraft
  firstRun: FirstRunStep | null
  connection: ConnectionDraft | null
  connectionLanguage: 'curl' | 'python'
  serverQuery: string
  sidebarOffset: number
  serverActivity: boolean
  serverAdvanced: boolean
  serverChoice: 'engine' | 'model' | 'host' | null
  serverDraft: { engine: string; model: string } | null
  serverView: string
  settingsGroup: string
  settingsExpanded: string[]
  setupGoal: string
  libraryView: LibraryView
  libraryCategory: string
  libraryRows: LibraryRow[]
  libraryQuery: string
  /** The text catalog's format: GGUF, a managed engine's safetensors, or Foundry Local. */
  libraryFormat: LibraryFormat
  /** Every engine the core registers here, for the formats the catalog offers. */
  libraryEngines: string[]
  /** The installed model a confirmation removes. */
  downloadSelection: {
    id: string
    owner: string
    name: string
    installed?: boolean
    returnFocus?: string
    returnOverlay?: WorkspaceState['overlay']
  } | null
  libraryRemove: string
  modelLoad?: { provider: string; model: string } | null
  modelVision: boolean | null
  loadError: { provider: string; model: string; message: string } | null
  libraryPlan: Record<string, unknown> | null
  /** The managed engine panel of Library → Engines, while it is open. */
  enginePanel: EnginePanel | null
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
  /** `providers`: every provider the core says lists the model; `provider` the first. */
  installed: { id: string; provider: string; name: string; providers?: string[]; store?: string }[]
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
    | 'chat-features'
    | 'chat-tools'
    | 'feature-editor'
    | 'feature-delete'
    | 'media-models'
    | 'media-stop'
    | 'media-preview'
    | 'setup-permission'
    | 'waiting-game'
    | 'connection-model'
    | 'connection-engine'
    | 'config-choice'
    | 'server-choice'
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
    | 'download-detail'
    | 'download-remove'
    | 'catalog-filters'
    | 'catalog-menu'
    | 'install-review'
    | 'engine-panel'
    | 'remove-model'
    | 'images'
    | 'cloud'
    | 'sections'
    | 'connection-guide'
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
    media: initialMedia(),
    waitingGame: null,
    catalogOpen: '',
    catalogVariant: '',
    catalogVariants: [],
    catalogMenu: null,
    setupMedia: { image: '', video: '', errors: {}, request: 0, loading: false },
    catalogFilters: defaultFilters(),
    catalogLikes: [],
    transferSamples: {},
    configDraft: {},
    remote: {},
    cloud: { provider: '', url: '', key: '', models: '', editing: false, error: '', providers: [] },
    firstRun: page === 'welcome' || page === 'setup' ? 'model' : null,
    connection: null,
    connectionLanguage: 'curl',
    serverQuery: '',
    sidebarOffset: 0,
    serverActivity: false,
    serverAdvanced: false,
    serverChoice: null,
    serverDraft: null,
    serverView: 'overview',
    settingsGroup: 'admin',
    settingsExpanded: [],
    setupGoal: 'chat',
    libraryView: 'catalog',
    libraryCategory: 'text',
    libraryRows: [],
    libraryQuery: '',
    libraryFormat: 'gguf',
    libraryEngines: [],
    libraryRemove: '',
    downloadSelection: null,
    modelVision: null,
    loadError: null,
    libraryPlan: null,
    enginePanel: null,
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
