/**
 * What `atc` knows about one managed engine (`engines.plan`): the core's plan for this machine and
 * everything around it a command, the terminal UI or the admin needs to show the engine's state —
 * read in one call so the three never assemble it differently. Browser-safe: types only.
 */

import type {
  EngineBuildKey,
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
  | { engine: string; status: 'updating'; operation_id: string; request_id: string }
  | { engine: string; status: 'ready'; active: EngineBuildKey }

/**
 * How this server was started, which decides how a new group membership reaches it (design D5): a
 * server from a terminal needs a new sign-in and `atc restart`, a `systemd --user` unit a restart of
 * the user manager, a system unit a restart of the unit.
 */
export type ServerLaunch = 'terminal' | 'systemd-user' | 'systemd-system' | 'launchd'
