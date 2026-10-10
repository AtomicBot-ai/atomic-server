/**
 * The release targets: the triple each binary is published under, and when the installers pick it.
 * The same table drives `scripts/build-binaries.mjs` (`scripts/targets.mjs`); a test keeps them equal.
 * A compiled binary knows its own triple (`ATC_TARGET`, baked in at build time), so an update fetches
 * the same variant the installer chose.
 */

export type TargetVariant = 'default' | 'baseline' | 'musl'

export interface Target {
  bun: string
  triple: string
  platform: 'darwin' | 'linux' | 'win32'
  arch: 'arm64' | 'x64'
  variant: TargetVariant
}

const row = (
  bun: string,
  triple: string,
  platform: Target['platform'],
  arch: Target['arch'],
  variant: TargetVariant = 'default'
): Target => ({
  bun,
  triple,
  platform,
  arch,
  variant,
})

export const TARGETS: readonly Target[] = [
  row('bun-darwin-arm64', 'aarch64-apple-darwin', 'darwin', 'arm64'),
  row('bun-darwin-x64', 'x86_64-apple-darwin', 'darwin', 'x64'),
  row('bun-linux-x64', 'x86_64-unknown-linux-gnu', 'linux', 'x64'),
  row('bun-linux-x64-baseline', 'x86_64-unknown-linux-gnu-baseline', 'linux', 'x64', 'baseline'),
  row('bun-linux-x64-musl', 'x86_64-unknown-linux-musl', 'linux', 'x64', 'musl'),
  row('bun-linux-arm64', 'aarch64-unknown-linux-gnu', 'linux', 'arm64'),
  row('bun-linux-arm64-musl', 'aarch64-unknown-linux-musl', 'linux', 'arm64', 'musl'),
  row('bun-windows-x64', 'x86_64-pc-windows-msvc', 'win32', 'x64'),
  row('bun-windows-x64-baseline', 'x86_64-pc-windows-msvc-baseline', 'win32', 'x64', 'baseline'),
  row('bun-windows-arm64', 'aarch64-pc-windows-msvc', 'win32', 'arm64'),
]

/** The target for a platform and CPU; `undefined` when no binary is published for it. */
export function targetFor(
  platform: string,
  arch: string,
  variant: TargetVariant = 'default'
): Target | undefined {
  return TARGETS.find((t) => t.platform === platform && t.arch === arch && t.variant === variant)
}

export function targetByTriple(triple: string): Target | undefined {
  return TARGETS.find((t) => t.triple === triple)
}

/** The release asset of a target, as the release workflow names it. */
export function assetName(version: string, target: Pick<Target, 'triple' | 'platform'>): string {
  return `atc-${version}-${target.triple}${target.platform === 'win32' ? '.exe' : ''}`
}
