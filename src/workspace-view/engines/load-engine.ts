/**
 * The engine a load goes to when none is named: `engines.default` when it is installed, else an
 * installed engine the model lists or one of the default's family (the llama.cpp builds run the same
 * files), so a machine with only the TurboQuant build does not download upstream llama.cpp for a load.
 * Nothing installed: the default, which `engines.autoInstall` may fetch.
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import { orderEngines } from './engine-order.js'

/** One entry of `engines.list`, as far as a load choice reads it. */
export interface EngineListing {
  engine: string
  kind?: string
  builds?: readonly unknown[]
  active?: unknown
}

/** The engines with a build on this machine, in display order. */
export function installedEngines(engines: readonly EngineListing[]): string[] {
  return orderEngines(
    engines
      .filter((e) => (e.builds?.length ?? 0) > 0 || (e.active !== null && e.active !== undefined))
      .map((e) => e.engine)
  )
}

export function chooseLoadEngine(
  fallback: string,
  engines: readonly EngineListing[],
  modelProviders: readonly string[] = []
): { engine: string; instead: boolean } {
  const installed = installedEngines(engines)
  // A default this host does not register is the caller's error to report, not one to paper over.
  if (installed.includes(fallback) || !installed.length || !engines.some((e) => e.engine === fallback))
    return { engine: fallback, instead: false }
  const kindOf = (id: string) => engines.find((e) => e.engine === id)?.kind ?? ENGINE_KINDS[id as EngineId]
  const family = kindOf(fallback)
  const candidates = installed.filter(
    (id) => modelProviders.includes(id) || (family !== undefined && kindOf(id) === family)
  )
  const own = candidates.find((id) => modelProviders.includes(id))
  const engine = own ?? candidates[0]
  return engine ? { engine, instead: true } : { engine: fallback, instead: false }
}
