/**
 * GGUF model setups, as `models.plan`, `models.install` and `setup.*` return them and the workspace
 * snapshot lists them under `setups`. atc owns these records (`<atc>/model-setups/`) and downloads
 * the files itself; the core only installs the PrismML build a file needs and judges compatibility
 * (ADR 2026-10-15-atc-downloads-its-own-models). The shapes are those of the core's former
 * `/model-setups` records, so clients that read them did not change.
 */
import type { ModelCompatibilityResponse } from '@atomic-chat/core/contracts'

export const MODEL_SETUP_STAGES = [
  'queued',
  'installing_engine',
  'downloading_model',
  'downloading_projector',
  'registering',
  'verifying',
  'ready',
  'failed',
  'cancelled',
  /** The server that ran it stopped mid-way; `setup.resume` continues from the files on disk. */
  'interrupted',
] as const
export type ModelSetupStage = (typeof MODEL_SETUP_STAGES)[number]

export interface ModelSetupPlanRequest {
  repo: string
  file: string
  /** Ignored for a Bonsai file the conf rules pin; otherwise `main`. */
  revision?: string
  /** Defaults to `<owner>/<file name without .gguf>`. */
  model_id?: string
  /** Download the family's default vision projector, when it has one. Default `true`. */
  include_projector?: boolean
}

/** One file of a setup, pinned to a revision. */
export interface ModelSetupArtifact {
  repo: string
  file: string
  revision: string
  sha256?: string
  /** Bytes; `0` when the Hub did not say. */
  size: number
}

/** The PrismML build a setup runs on. */
export interface ModelSetupEngine {
  provider: 'atomic-prism'
  version: string
  backend: string
  /** Already on disk. */
  installed: boolean
  /** Bytes to download; `0` when installed. */
  download_size: number
}

export interface ModelSetupBlocker {
  code: 'unsupported' | 'legacy_artifact' | 'no_engine_build' | 'insufficient_disk_space'
  message: string
  replacement?: string
}

export interface ModelSetupPlan {
  /** Hash of what decides the work; `models.install` takes it. */
  digest: string
  model_id: string
  /** `atomic-prism`, or `llamacpp-upstream` for a stock file. */
  provider: string
  verdict: ModelCompatibilityResponse
  /** `null`: no PrismML build is involved. */
  engine: ModelSetupEngine | null
  model: ModelSetupArtifact
  projector: ModelSetupArtifact | null
  total_download_bytes: number
  /** Free bytes on the data folder's volume, `null` when unknown. Not part of `digest`. */
  free_bytes: number | null
  blockers: ModelSetupBlocker[]
}

export interface ModelSetup {
  setup_id: string
  request_id: string
  stage: ModelSetupStage
  request: ModelSetupPlanRequest
  plan: ModelSetupPlan
  /** Download task ids per stage; their progress is in the snapshot's `downloads`. */
  task_ids: { engine?: string; model: string; projector?: string }
  /** Where a failed, cancelled or interrupted setup stopped. */
  stopped_at?: ModelSetupStage
  error?: { code: string; message: string }
  created_at: number
  updated_at: number
}
