#!/usr/bin/env node
// Build the atc deb and rpm from the release binaries with nfpm, and render the AUR PKGBUILD. Names,
// versions and the PKGBUILD template filling are in linux-packaging.mjs.
//
//   node scripts/linux-packages.mjs build [--version X.Y.Z] [--bin-dir dist/bin] [--out dist/pkg]
//   node scripts/linux-packages.mjs pkgbuild --sums SHA256SUMS [--version X.Y.Z] [--source-base URL] [--out .]
//
// `build` runs on Linux, x64 or arm64: it runs the binary of this machine to write the shell
// completions. It signs the rpm when RPM_SIGNING_KEY_FILE names an armored private key (its passphrase
// in NFPM_RPM_PASSPHRASE); unset, the rpm is unsigned (a dry run). `--source-base` defaults to the
// release's download URL on GitHub.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PACKAGE_FORMATS,
  PACKAGE_TARGETS,
  packageFileName,
  parseSha256Sums,
  renderPkgbuild,
} from './linux-packaging.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPO = 'AtomicBot-ai/eye-cli'
const SHELLS = [
  ['bash', 'atc.bash'],
  ['zsh', '_atc'],
  ['fish', 'atc.fish'],
]

function fail(message) {
  console.error(`linux-packages: ${message}`)
  process.exit(1)
}

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  if (at < 0) return fallback
  const value = process.argv[at + 1]
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`)
  return value
}

function run(command, args, options = {}) {
  const res = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (res.error) fail(`${command}: ${res.error.message}`)
  if (res.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${res.stderr ?? ''}`)
  return res.stdout
}

const version = option('version', JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version)

function build() {
  const binDir = resolve(option('bin-dir', join(ROOT, 'dist/bin')))
  const out = resolve(option('out', join(ROOT, 'dist/pkg')))
  const binaries = PACKAGE_TARGETS.map((t) => ({ ...t, path: join(binDir, `atc-${t.triple}`) }))
  for (const b of binaries) if (!existsSync(b.path)) fail(`${b.path} is missing; build or download it first`)
  const host = binaries.find((b) => process.platform === 'linux' && b.node === process.arch)
  if (!host) fail('run on Linux, x64 or arm64: the completions come from running the binary')

  const stage = mkdtempSync(join(tmpdir(), 'atc-pkg-'))
  try {
    mkdirSync(join(stage, 'completions'))
    mkdirSync(join(stage, 'data'))
    for (const [shell, file] of SHELLS) {
      const script = run(host.path, ['completion', shell, '--data-folder', join(stage, 'data')])
      writeFileSync(join(stage, 'completions', file), script)
    }
    mkdirSync(out, { recursive: true })
    for (const format of PACKAGE_FORMATS) {
      // nfpm reads the marker from the stage; each format writes its own name into it.
      writeFileSync(join(stage, 'install-source'), `${format}\n`)
      for (const b of binaries) {
        const target = join(out, packageFileName(version, format, b))
        const env = {
          ...process.env,
          VERSION: version,
          ARCH: b.nfpm,
          BINARY: b.path,
          STAGE: stage,
          RPM_SIGNING_KEY_FILE: process.env.RPM_SIGNING_KEY_FILE ?? '',
        }
        run(
          'nfpm',
          ['package', '--config', 'packaging/nfpm.yaml', '--packager', format, '--target', target],
          {
            cwd: ROOT,
            env,
          }
        )
        console.log(`built ${target}`)
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

function pkgbuild() {
  const sumsFile = option('sums')
  if (!sumsFile) fail('pkgbuild needs --sums <SHA256SUMS of the release>')
  const sourceBase = option('source-base', `https://github.com/${REPO}/releases/download/v${version}`)
  const out = resolve(option('out', '.'))
  const sums = parseSha256Sums(readFileSync(sumsFile, 'utf8'))
  const template = readFileSync(join(ROOT, 'packaging/PKGBUILD.in'), 'utf8')
  let text
  try {
    text = renderPkgbuild(template, { version, sums, sourceBase })
  } catch (error) {
    fail(error.message)
  }
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'PKGBUILD'), text)
  console.log(`wrote ${join(out, 'PKGBUILD')} for atc ${version}`)
}

const command = process.argv[2]
if (command === 'build') build()
else if (command === 'pkgbuild') pkgbuild()
else fail('usage: linux-packages.mjs build|pkgbuild [options]; see the header of this file')
