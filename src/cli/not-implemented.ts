/**
 * The registry of scaffold stubs and the iteration each one is planned for. One source of truth:
 * `notImplemented()` reads it for its message, and a test asserts that every stub in the command
 * tree is listed here and every entry here is a stub — so a command cannot be implemented while
 * still listed, or listed while quietly missing. The plan behind the iterations is docs/roadmap.md.
 */

export const ITERATIONS = {
  I2: 'iteration 2 (a first model answering: engines install, models pull, run, unload, the API)',
  I3: 'iteration 3 (models: catalog, resolver, resumable pull, list, rm, info; API keys)',
  I4: 'iteration 4 (engines and hardware from the core; the managed runtime; elevation)',
  I5: 'iteration 5 (admin pages: API, models, engines; non-loopback consent)',
  I6: 'iteration 6 (service, update, doctor completion)',
  I7: 'iteration 7 (admin: engine install wizard, logs, settings, hardware)',
} as const
export type Iteration = keyof typeof ITERATIONS

/** Command path → iteration. Keys are the space-joined path below `atc`. */
export const PLANNED: Record<string, Iteration> = {}

/** Features of otherwise working commands that are still stubs (`atc logs -f`, `atc update` without `--check`). */
export const PLANNED_PARTIAL: Record<string, Iteration> = {
  'config engine.*': 'I2',
}

export function plannedPartial(feature: string): string {
  const key = PLANNED_PARTIAL[feature]
  return key === undefined ? 'a later iteration' : ITERATIONS[key]
}

export function plannedFor(path: readonly string[]): string | undefined {
  const key = PLANNED[path.join(' ')]
  return key === undefined ? undefined : ITERATIONS[key]
}
