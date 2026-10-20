/** The core's managed-runtime shapes as 0.18.5 answers them, for tests of what `atc` makes of them. */
import type {
  EnvironmentOperation,
  EnvironmentSnapshot,
  ManagedPhase,
  RequirementPlan,
  RuntimeInstallation,
} from '@atomic-chat/core/contracts'

export const DIGEST_A = `sha256:${'a'.repeat(64)}` as const
export const DIGEST_B = `sha256:${'b'.repeat(64)}` as const

export function installation(engine: string, over: Partial<RuntimeInstallation> = {}): RuntimeInstallation {
  return {
    installation_id: engine,
    engine_id: engine,
    environment_id: 'default',
    active_descriptor_id: `${engine}-2026.10.1`,
    candidate_descriptor_id: null,
    availability: 'supported',
    status: 'ready',
    ...over,
  }
}

export function environment(over: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    schema_version: 1,
    environment_id: 'default',
    instance_id: 'fake-instance',
    revision: 1,
    executor: 'linux-docker',
    availability: 'setup-required',
    gpus: [],
    blockers: [],
    selinux: null,
    installations: [],
    active_operation_id: null,
    minimum_app_version: null,
    distribution: null,
    source_overrides: [],
    ...over,
  }
}

export function plan(engine: string, over: Partial<RequirementPlan> = {}): RequirementPlan {
  return {
    plan_digest: DIGEST_A,
    environment_id: 'default',
    target: { kind: 'runtime', installation_id: engine, engine_id: engine },
    availability: 'setup-required',
    recipe_id: 'linux-apt-docker-ce',
    recipe_digest: DIGEST_B,
    descriptor_id: `${engine}-2026.10.1`,
    environment_manifest_id: 'linux-r3',
    image_digest: DIGEST_B,
    adopts_existing_engine: false,
    system_changes: [
      { code: 'install-docker', text: 'Install Docker Engine from Docker’s apt repository.' },
      { code: 'add-user-to-docker-group', text: 'Add user u to the docker group.' },
    ],
    download_bytes: 9_000_000_000,
    required_disk_bytes: 20_000_000_000,
    docker_root_dir: '/var/lib/docker',
    free_disk_bytes: 100_000_000_000,
    requires_elevation: true,
    may_require_relogin: true,
    may_require_reboot: false,
    blockers: [],
    warnings: [],
    ...over,
  }
}

export function operation(
  engine: string,
  phase: ManagedPhase,
  over: Partial<EnvironmentOperation> = {}
): EnvironmentOperation {
  return {
    schema_version: 1,
    operation_id: `op-${engine}`,
    request_id: `req-${engine}`,
    environment_id: 'default',
    target: { kind: 'runtime', installation_id: engine, engine_id: engine },
    kind: 'setup',
    instance_id: 'fake-instance',
    revision: 3,
    phase,
    plan_digest: DIGEST_A,
    approved_plan_digest: null,
    carried_plan_digest: null,
    progress: null,
    pending_host_step: null,
    completed_step_ids: [],
    cancellation_requested: false,
    error: null,
    ...over,
  }
}
