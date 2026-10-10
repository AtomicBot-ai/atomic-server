// The release targets, one row per binary: the Bun compile target, the release triple (asset names,
// the installers, `atc update`), and when the installers pick it. `src/update/targets.ts` holds the
// same table for the program; `src/update/targets.test.ts` keeps the two equal.
//
// variant: 'default' — the usual build (x64 needs AVX2, roughly Haswell 2013 and later);
//          'baseline' — x64 without AVX2; 'musl' — Linux without glibc (Alpine).
export const TARGETS = [
  {
    bun: 'bun-darwin-arm64',
    triple: 'aarch64-apple-darwin',
    platform: 'darwin',
    arch: 'arm64',
    variant: 'default',
  },
  {
    bun: 'bun-darwin-x64',
    triple: 'x86_64-apple-darwin',
    platform: 'darwin',
    arch: 'x64',
    variant: 'default',
  },
  {
    bun: 'bun-linux-x64',
    triple: 'x86_64-unknown-linux-gnu',
    platform: 'linux',
    arch: 'x64',
    variant: 'default',
  },
  {
    bun: 'bun-linux-x64-baseline',
    triple: 'x86_64-unknown-linux-gnu-baseline',
    platform: 'linux',
    arch: 'x64',
    variant: 'baseline',
  },
  {
    bun: 'bun-linux-x64-musl',
    triple: 'x86_64-unknown-linux-musl',
    platform: 'linux',
    arch: 'x64',
    variant: 'musl',
  },
  {
    bun: 'bun-linux-arm64',
    triple: 'aarch64-unknown-linux-gnu',
    platform: 'linux',
    arch: 'arm64',
    variant: 'default',
  },
  {
    bun: 'bun-linux-arm64-musl',
    triple: 'aarch64-unknown-linux-musl',
    platform: 'linux',
    arch: 'arm64',
    variant: 'musl',
  },
  {
    bun: 'bun-windows-x64',
    triple: 'x86_64-pc-windows-msvc',
    platform: 'win32',
    arch: 'x64',
    variant: 'default',
  },
  {
    bun: 'bun-windows-x64-baseline',
    triple: 'x86_64-pc-windows-msvc-baseline',
    platform: 'win32',
    arch: 'x64',
    variant: 'baseline',
  },
  {
    bun: 'bun-windows-arm64',
    triple: 'aarch64-pc-windows-msvc',
    platform: 'win32',
    arch: 'arm64',
    variant: 'default',
  },
]
