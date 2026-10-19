import type { BackendCatalogResponse } from '@atomic-chat/core'
import type { ModelSetup, ModelSetupPlan, ModelSetupPlanRequest } from '../contract/index.js'
export type { BackendCatalogResponse, ModelSetup, ModelSetupPlan, ModelSetupPlanRequest }
export interface SetupSelection {
  request: ModelSetupPlanRequest
  plan: ModelSetupPlan
  requestId: string
}
export interface SetupManifest {
  /** 2: the setups are atc's own. 1: an earlier atc's, run by the core; started again on resume. */
  version: 1 | 2
  mode: 'personal' | 'server'
  startedAt: number
  complete: boolean
  /** Once true, later installations never gate entry into the workspace. */
  onboarded?: boolean
  engine: { provider: string; version: string; backend: string; taskId: string }
  selections: SetupSelection[]
}
export interface Transfer {
  taskId: string
  transferred: number
  total: number
  percent: number
}
export interface SetupProgress {
  manifest: SetupManifest
  jobs: ModelSetup[]
  engineReady: boolean
  speed: number
  eta: number | null
  transfers: Transfer[]
  error: string
  ready: boolean
  /** The installation was started by an earlier version; resuming starts it again, reusing files. */
  restart?: boolean
}
export interface HubRepository {
  id: string
  downloads: number
  title?: string
  summary?: string
}
export interface ModelFile {
  filename: string
  size: number
}
export interface SetupView {
  stage: 'engine' | 'models' | 'review' | 'download' | 'ready'
  mode: 'personal' | 'server'
  catalogs: BackendCatalogResponse[]
  engine: string
  query: string
  repositories: HubRepository[]
  repository: string
  files: ModelFile[]
  selections: SetupSelection[]
  progress: SetupProgress | null
  busy: boolean
  error: string
  startedAt: number
  pending: ModelSetupPlanRequest | null
  preparing: boolean
}
export function newSetup(mode: 'personal' | 'server'): SetupView {
  return {
    stage: 'engine',
    mode,
    catalogs: [],
    engine: '',
    query: '',
    repositories: [],
    repository: '',
    files: [],
    selections: [],
    progress: null,
    busy: false,
    error: '',
    startedAt: 0,
    pending: null,
    preparing: false,
  }
}
