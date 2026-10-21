/**
 * The environment the server hands its core, and the core every process it starts. On Linux,
 * `TF_BUILD=True`: Foundry Local's library then sends no 1DS telemetry, whose mandatory `ProcessInfo`
 * upload crashes its host about ten seconds after a model loads (a segfault in the curl the library
 * bundles; recorded on Ubuntu 26.04, CPU and CUDA alike). ADR 2026-10-21-foundry-local-1ds-off-on-linux;
 * drop it once the core or the library no longer crashes. A value the person set is kept.
 */
export function coreEnv(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform | string
): Record<string, string | undefined> {
  if (platform !== 'linux' || env['TF_BUILD'] !== undefined) return { ...env }
  return { ...env, TF_BUILD: 'True' }
}
