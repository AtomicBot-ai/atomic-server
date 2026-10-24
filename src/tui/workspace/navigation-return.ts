import type { WorkspaceState } from './state.js'
import { PAGE_FOCUS } from './state.js'
import { workspacePage } from './navigation.js'
import type { ActionContext } from './action-types.js'

type Location = Pick<
  WorkspaceState,
  | 'page'
  | 'serverView'
  | 'settingsGroup'
  | 'libraryView'
  | 'focus'
  | 'scroll'
  | 'selected'
  | 'operationReturn'
  | 'operation'
  | 'toolGroup'
>
export interface WorkspaceReturnState {
  settingsReturn?: Location | undefined
  connectionReturn?: Location | undefined
}
export function workspaceLocation(s: WorkspaceState): Location {
  const {
    page,
    serverView,
    settingsGroup,
    libraryView,
    focus,
    scroll,
    selected,
    operationReturn,
    operation,
    toolGroup,
  } = s
  return {
    page,
    serverView,
    settingsGroup,
    libraryView,
    focus,
    scroll,
    selected,
    operationReturn,
    operation,
    toolGroup,
  }
}

export function navigationReturnAction(id: string, ctx: ActionContext): boolean {
  const s = ctx.get()
  if (id === 'settings-back') {
    ctx.update((v) => ({
      ...v,
      ...(v.settingsReturn ?? { page: 'server', serverView: 'overview', focus: 'api-toggle' }),
      overlay: null,
      settingsReturn: undefined,
      hover: '',
      message: '',
    }))
    return true
  }
  const page = id === 'page:access' ? 'access' : id === 'page:settings' ? 'settings' : undefined
  if (!s.setupComplete || (!page && !id.startsWith('settings-section:'))) return false
  if (workspacePage(s) !== 'access') ctx.update((v) => ({ ...v, settingsReturn: workspaceLocation(s) }))
  if (!page) return false
  ctx.update((v) => ({
    ...v,
    page,
    serverView: 'overview',
    settingsGroup: page === 'access' ? 'admin' : 'tui',
    overlay: null,
    selected: 0,
    scroll: 0,
    focus: PAGE_FOCUS[page],
    hover: '',
    message: '',
  }))
  return true
}
