/**
 * `atc doctor`'s read-only checks of the managed environment (spec managed-engines-server, "Состояние
 * и диагностика"): what the core's plan for each managed engine and its environment diagnostics say
 * about the NVIDIA driver, Docker and the user's access to it, the NVIDIA Container Toolkit and, on
 * Windows, WSL and the distribution. Nothing is probed here and nothing changes: the core's blockers
 * and system changes are sorted by their codes and shown in the core's own words.
 */

import type { EnvironmentDiagnostics, ManagedBlocker } from '@atomic-chat/core/contracts'
import { WSL_REASONS } from '@atomic-chat/core/contracts'
import type { ManagedEngineState } from '../contract/index.js'
import { engineView, formatSize } from '../workspace-view/index.js'
import type { Check, CheckContext, CheckResult } from './checks.js'

/** What the running server's core says about its managed engines; `undefined` when none runs. */
export interface ManagedFacts {
  engines: ManagedEngineState[]
  diagnostics: Pick<EnvironmentDiagnostics, 'environment'> | null
}

type Outcome = Omit<CheckResult, 'id' | 'title'>
const DRIVER = ['driver-missing', 'driver-too-old', 'compute-capability-too-low']
const DOCKER = ['docker-service-inactive', 'relogin-required', 'init-not-systemd', 'unknown-fact']
const TOOLKIT = ['toolkit-missing', 'gpu-runtime-not-configured']
const TOOLKIT_CHANGES = ['configure-nvidia-runtime', 'generate-cdi-spec']
const WSL: readonly string[] = WSL_REASONS

/** Each engine's blockers whose reason is one of `reasons`, with the engine named. */
function blockers(facts: ManagedFacts, reasons: readonly string[]) {
  return facts.engines.flatMap((e) =>
    (e.plan?.blockers ?? [])
      .filter((b) => reasons.includes(b.reason ?? ''))
      .map((b): [string, ManagedBlocker] => [e.engine, b])
  )
}

function failed(found: Array<[string, ManagedBlocker]>): Outcome {
  const commands = found.flatMap(([, b]) => b.commands ?? [])
  return {
    status: 'fail',
    message: found.map(([engine, b]) => `${engine}: ${b.message}`).join('; '),
    ...(commands.length ? { hint: commands.join('; ') } : {}),
  }
}

/** The managed checks run only where the core offers managed engines and its server answers. */
function managedCheck(id: string, title: string, judge: (facts: ManagedFacts) => Outcome): Check {
  return {
    id,
    title,
    run: async (ctx: CheckContext) => {
      if (ctx.host.facts.platform === 'darwin')
        return { status: 'skip', message: 'not applicable: managed engines do not run on macOS' }
      const facts = await ctx.managed?.()
      if (!facts) return { status: 'skip', message: 'the server is not running; start it to check' }
      if (facts.engines.length === 0)
        return {
          status: 'skip',
          message: 'not applicable: the core offers no managed engine on this machine',
        }
      return judge(facts)
    },
  }
}

const hostPlan = (facts: ManagedFacts) => facts.engines.find((e) => e.plan)?.plan ?? null

export const MANAGED_CHECKS: Check[] = [
  managedCheck('managed-engines', 'managed engines', (facts) => ({
    status: 'ok',
    message: facts.engines.map((e) => `${e.engine}: ${engineView(e).summary}`).join('; '),
  })),
  managedCheck('managed-driver', 'NVIDIA driver (managed engines)', (facts) => {
    const found = blockers(facts, DRIVER)
    if (found.length) return failed(found)
    const gpus = facts.diagnostics?.environment?.gpus ?? []
    if (!gpus.length) return { status: 'warn', message: 'the core sees no NVIDIA GPU' }
    return {
      status: 'ok',
      message: gpus
        .map((g) => `${g.name}${g.driver_version ? ` (driver ${g.driver_version})` : ''}`)
        .join('; '),
    }
  }),
  managedCheck('managed-docker', 'Docker and access to it', (facts) => {
    const found = blockers(facts, DOCKER)
    if (found.length) return failed(found)
    const plan = hostPlan(facts)
    if (!plan) return { status: 'warn', message: 'the core gave no plan' }
    if (plan.adopts_existing_engine)
      return { status: 'ok', message: 'Docker with the NVIDIA runtime works; setup uses it as it is' }
    if (!plan.system_changes.length) return { status: 'ok', message: 'setup needs no system change' }
    return {
      status: 'warn',
      message: `setup would: ${plan.system_changes.map((c) => c.text).join(' ')}`,
      hint: `atc engines install ${facts.engines[0]?.engine ?? '<engine>'} --dry-run shows the whole plan`,
    }
  }),
  managedCheck('managed-toolkit', 'NVIDIA Container Toolkit', (facts) => {
    const found = blockers(facts, TOOLKIT)
    if (found.length) return failed(found)
    const plan = hostPlan(facts)
    const changes = (plan?.system_changes ?? []).filter((c) => TOOLKIT_CHANGES.includes(c.code))
    if (changes.length)
      return { status: 'warn', message: `setup would: ${changes.map((c) => c.text).join(' ')}` }
    return { status: 'ok', message: plan?.adopts_existing_engine ? 'configured for Docker' : 'nothing to do' }
  }),
  managedCheck('managed-wsl', 'WSL and the distribution', (facts) => {
    if (facts.engines.every((e) => e.executor !== 'wsl-docker'))
      return { status: 'skip', message: 'not applicable: Docker runs on this host itself' }
    const found = blockers(facts, WSL)
    if (found.length) return failed(found)
    const distribution = facts.diagnostics?.environment?.distribution ?? null
    if (!distribution)
      return {
        status: 'warn',
        message: 'Atomic Chat’s WSL distribution is not imported yet',
        hint: 'atc engines install <engine> imports it',
      }
    return {
      status: 'ok',
      message: `${distribution.name} at ${distribution.path} (${formatSize(distribution.size_bytes)})`,
    }
  }),
]
