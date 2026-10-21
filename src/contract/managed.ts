/**
 * What `atc` knows about one managed engine (`engines.plan`): the core's plan for this machine and
 * everything around it a command, the terminal UI or the admin needs to show the engine's state —
 * read in one call so the three never assemble it differently. Browser-safe: types only.
 */

import type {
  EngineBuildKey,
  ErrorBody,
  FoundryLocalAccelerators,
  FoundryLocalAcceleratorsEvent,
  FoundryLocalPrepareResult,
  ModelCompatibility,
  EngineUpdateOffer,
  EnvironmentOperation,
  ExecutorKind,
  RequirementPlan,
  RuntimeInstallation,
} from '@atomic-chat/core/contracts'

/** Phases after which a managed operation does nothing more on its own. */
export const MANAGED_FINISHED_PHASES = ['ready', 'removed', 'cancelled', 'failed'] as const

export interface ManagedEngineState {
  engine: string
  /** The one environment of this machine user; `null` where the core has none to offer. */
  environment_id: string | null
  executor: ExecutorKind | null
  /** The core's setup plan (`POST /environments/probe`); `null` when the probe failed. */
  plan: RequirementPlan | null
  /** Why the probe failed, when it did. */
  plan_error: string | null
  /** The NVIDIA notices of the plan's descriptor, verbatim and in order. */
  notices: string[]
  installation: RuntimeInstallation | null
  /** This engine's setup or removal still in progress. */
  operation: EnvironmentOperation | null
  /** Another managed engine's operation in progress: the core runs one at a time, so this one waits. */
  other_operation: EnvironmentOperation | null
  /** The last setup of this engine that ended `failed`. */
  failed: EnvironmentOperation | null
  /** The other managed engines installed here: the store's models stay for them on a removal. */
  models_kept_for: string[]
  /** `POST /engines/versions`' offer for this engine; `null` when it was not asked or not answered. */
  update: EngineUpdateOffer | null
}

/**
 * `engines.install` for a managed engine: the plan to agree to, the update the core began (a removal
 * that keeps the models, then a setup under `<request_id>:setup` that waits for consent), or ready.
 */
export type ManagedInstallResult =
  | { engine: string; status: 'plan'; state: ManagedEngineState }
  /** An update offered: the new release's plan; the reinstall begins only with `approved_update: target`. */
  | { engine: string; status: 'update'; from: string; target: string; state: ManagedEngineState }
  | { engine: string; status: 'updating'; operation_id: string; request_id: string }
  | { engine: string; status: 'ready'; active: EngineBuildKey }

/**
 * How this server was started, which decides how a new group membership reaches it (design D5): a
 * server from a terminal needs a new sign-in and `atc restart`, a `systemd --user` unit a restart of
 * the user manager, a system unit a restart of the unit.
 */
export type ServerLaunch = 'terminal' | 'systemd-user' | 'systemd-system' | 'launchd'

/** One managed engine's answer about a checkpoint: the core's verdict, or why it gave none. */
export interface ManagedVerdict {
  engine: string
  /** The engine's installation is `ready` here: it could load the model once downloaded. */
  installed: boolean
  compatibility: ModelCompatibility | null
  error: ErrorBody | null
}

/** `models.check`: a revision of a Hugging Face repository and each managed engine's verdict on it. */
export interface ModelCheckResult {
  repository: string
  /** The commit the requested revision resolved to. */
  revision: string
  verdicts: ManagedVerdict[]
}

/** One file of a checkpoint revision, as Hugging Face lists it and `model.yml` records it. */
export interface ManagedModelFile {
  path: string
  size: number
  sha256: string | null
}

/**
 * `managed.plan`: what downloading a checkpoint into the managed engines' shared store would do — the
 * revision, the engine whose verdict allows it, where the core keeps the store, the files still to
 * fetch, and why it cannot start (`blockers`). `present` when that revision is already in the store.
 */
export interface ManagedModelPlan {
  digest: string
  repository: string
  revision: string
  engine: string
  architectures: string[]
  /** The store's root as the core names it (on Windows a `\\wsl.localhost\…` path). */
  root: string
  files: ManagedModelFile[]
  /** Paths still to download; empty when `present`. */
  pending: string[]
  download_bytes: number
  free_bytes: number | null
  verdict: ManagedVerdict
  present: boolean
  blockers: string[]
}

/** A durable download into the store (`managed.install`), listed with the server's other setups. */
export interface ManagedModelJob {
  id: string
  kind: 'managed-model'
  plan: ManagedModelPlan
  stage: 'queued' | 'downloading' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'interrupted'
  error?: string
  updated_at: number
}

/** `foundry.accelerators`: the library's probe, and whether this server is preparing accelerators now. */
export type FoundryAcceleratorsView = FoundryLocalAccelerators & {
  preparing: boolean
  /** The last prepare's summary, `null` before one ended. */
  last_result: FoundryLocalPrepareResult | null
  last_error: string | null
  /** The latest step of each accelerator in the prepare running now (or the last one). */
  steps: FoundryLocalAcceleratorsEvent[]
}

/** `foundry.plan`: one Foundry Local variant to download, chosen and checked, with its files. */
export interface FoundryModelPlan {
  digest: string
  model_id: string
  name: string
  variant_id: string
  device: string
  execution_provider: string
  asset_id: string
  version: string
  /** A catalog model: files listed from Azure Blob, checked by size only. */
  unverified: boolean
  verdict: { verdict: string; reason: string | null; accelerator: string | null }
  /** `<data>/foundry-local/models/<variant_id>`. */
  dir: string
  prefix: string
  files: Array<{ path: string; size: number; sha256?: string }>
  pending: string[]
  download_bytes: number
  free_bytes: number | null
  /** What `model.yml` records besides the files: from conf's list, else the resolve answer's tags. */
  record: {
    context_length?: number
    tools: boolean
    reasoning: boolean
    reasoning_start?: string
    reasoning_end?: string
  }
  blockers: string[]
}

export interface FoundryModelJob {
  id: string
  kind: 'foundry-model'
  plan: FoundryModelPlan
  stage: 'queued' | 'downloading' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'interrupted'
  error?: string
  /** How many times an expired link was resolved again in this run. */
  relinks?: number
  updated_at: number
}
