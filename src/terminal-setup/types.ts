import type { FoundryModelPlan, ManagedModelPlan, ManagedVerdict } from '../contract/index.js'
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
  /** Every engine the core registers here, in display order (`engines.list`). */
  registered: string[]
  /** The registered engines installed here (an active build or installation). */
  installed: string[]
  /** Setup with a managed engine or Foundry Local instead of a GGUF download. */
  path: EngineSetupPath | null
  engine: string
  /** First-run model radio selection; keyboard focus can move without changing it. */
  firstChoice?: string
  /** Preserve the chosen workspace destination when a background first model becomes ready. */
  destination?: 'chat' | 'server'
  /** Core-reported hardware summary used by first run. Memory is in MiB. */
  device?: { name: string; memory: number }
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
    registered: [],
    installed: [],
    path: null,
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

/** A managed engine's or Foundry Local's model download that guided setup started (its request id). */
export interface EngineSetupJob {
  id: string
  kind: 'managed-model' | 'foundry-model'
  engine: string
  /** The model id the engine loads: the repository, or the Foundry Local variant. */
  model: string
}
export interface EngineSetupRow {
  id: string
  title: string
  detail: string
}
/** Guided setup with a managed engine or Foundry Local: its model list, the reviewed plan, the job. */
export interface EngineSetupPath {
  engine: string
  kind: 'managed' | 'foundry'
  rows: EngineSetupRow[]
  plan: ManagedModelPlan | FoundryModelPlan | null
  /** The core's verdict of every managed engine on the reviewed checkpoint (`models.check`). */
  verdicts?: ManagedVerdict[]
  job: EngineSetupJob | null
}
