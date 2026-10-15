#!/usr/bin/env node
// Compile `atc` into single binaries with Bun (the core's script, adapted). This is the ONLY place
// the runtime choice lives: swapping Bun for Node SEA means editing this file, not src/.
//
//   node scripts/build-binaries.mjs --host   # current platform only
//   node scripts/build-binaries.mjs --all    # every target in targets.mjs (cross-compile)
//   node scripts/build-binaries.mjs --target x86_64-unknown-linux-musl   # one, by triple
//
// Run `npm run embed:ui` first (the npm scripts do): the admin SPA is a generated module.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGETS } from './targets.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(ROOT, 'src/bin.ts')
const OUT_DIR = join(ROOT, 'dist/bin')

export { TARGETS }

function hostTarget() {
  const { platform, arch } = process
  const target = TARGETS.find((t) => t.platform === platform && t.arch === arch && t.variant === 'default')
  if (!target) throw new Error(`unsupported host ${platform}/${arch}`)
  return target
}

if (!existsSync(join(ROOT, 'src/admin/static-assets.generated.ts'))) {
  console.error('src/admin/static-assets.generated.ts is missing; run `npm run embed:ui` first')
  process.exit(1)
}

const GIT_SHA = (process.env.ATC_GIT_SHA ?? process.env.GITHUB_SHA ?? gitSha() ?? '').trim().slice(0, 12)
const BUILD_DATE = new Date().toISOString().slice(0, 10)

function gitSha() {
  const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return res.status === 0 ? res.stdout : undefined
}

const all = process.argv.includes('--all')
const only = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : undefined
const targets = all ? TARGETS : only ? TARGETS.filter((t) => t.triple === only) : [hostTarget()]
if (targets.length === 0) {
  console.error(`no target ${only}; known: ${TARGETS.map((t) => t.triple).join(', ')}`)
  process.exit(1)
}
function bunTempFiles() {
  return readdirSync(ROOT).filter((name) => name.endsWith('.bun-build'))
}

mkdirSync(OUT_DIR, { recursive: true })

for (const { bun: target, triple, platform } of targets) {
  const outfile = join(OUT_DIR, `atc-${triple}${platform === 'win32' ? '.exe' : ''}`)
  const args = [
    'build',
    '--compile',
    `--target=${target}`,
    // `--production` is what makes Bun emit the production JSX runtime (`jsx`, not `jsxDEV`) to
    // match React's production build; `--compile` alone does not. It also minifies identifiers, so
    // `--keep-names` keeps function and class names for stack traces; the source map maps to src/.
    // The terminal UI's Ink pulls `react-devtools-core` only when DEV=true; it is a devDependency so
    // the bundler can resolve it (an --external import is hoisted and fails at start).
    '--production',
    '--keep-names',
    '--sourcemap',
    '--define',
    `__ATC_GIT_SHA__=${JSON.stringify(GIT_SHA)}`,
    '--define',
    `__ATC_BUILD_DATE__=${JSON.stringify(BUILD_DATE)}`,
    // Which binary this is, so `atc update` fetches the same variant (baseline, musl) the installer chose.
    '--define',
    `__ATC_TARGET__=${JSON.stringify(triple)}`,
    // The core labels its error reports with this; unset, a release would report as "source".
    ...(process.env.ATC_SENTRY_ENVIRONMENT
      ? [
          '--define',
          `__ATOMIC_CORE_SENTRY_ENVIRONMENT__=${JSON.stringify(process.env.ATC_SENTRY_ENVIRONMENT)}`,
        ]
      : []),
    ENTRY,
    '--outfile',
    outfile,
  ]
  console.log(`bun ${args.join(' ')}`)
  const before = new Set(bunTempFiles())
  const res = spawnSync('bun', args, { stdio: 'inherit', cwd: ROOT })
  // `bun build --compile` can leave its 60 MB working copy (`.<hash>.bun-build`) in the cwd; remove the
  // ones this run created, never older ones.
  for (const name of bunTempFiles()) if (!before.has(name)) rmSync(join(ROOT, name), { force: true })
  if (res.status !== 0) {
    console.error(`build failed for ${target}`)
    process.exit(res.status ?? 1)
  }
  // Bun's darwin output carries a signature that no longer matches once the program is embedded
  // (the x64 one is even Bun's own Developer ID): `codesign --verify` fails on it. Re-sign ad hoc on a
  // Mac, as atomic-agent does, so local and CI runs execute a valid binary; the release workflow then
  // signs with the Developer ID (scripts/sign-mac-binary.sh).
  if (platform === 'darwin' && process.platform === 'darwin') {
    const sign = spawnSync('codesign', ['--force', '--sign', '-', '--timestamp=none', outfile], {
      stdio: 'inherit',
    })
    if (sign.status !== 0) {
      console.error(`ad-hoc signing failed for ${outfile}`)
      process.exit(sign.status ?? 1)
    }
  }
}
console.log(`built ${targets.length} binar${targets.length === 1 ? 'y' : 'ies'} into dist/bin`)
