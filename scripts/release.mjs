#!/usr/bin/env node
// The release command (the core's, adapted): bump the version, commit, tag. Pushing the tag makes
// .github/workflows/release.yml run the CI gates, build every binary and publish the release.
//
//   npm run release -- patch          # 0.1.0 → 0.1.1
//   npm run release -- minor          # 0.1.0 → 0.2.0
//   npm run release -- major          # 0.1.0 → 1.0.0
//   npm run release -- 1.2.3          # an explicit version; the current one only tags HEAD
//   npm run release -- patch --push   # and push the branch and the tag: publish it
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PACKAGE_JSON = join(ROOT, 'package.json')
const VERSION_TS = join(ROOT, 'src/version.ts')
// A release `X.Y.Z`, or a release candidate `X.Y.Z-rc.N`, which the workflow publishes as a pre-release.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

function git(...args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (res.status !== 0)
    fail(`git ${args.join(' ')} failed: ${(res.stderr || res.error?.message || '').trim()}`)
  return res.stdout.trim()
}

/** `[major, minor, patch, rc]`; `rc` is `Infinity` for a release, so a candidate sorts before it. */
function parse(version) {
  const match = SEMVER.exec(version)
  if (!match) fail(`${version} is not X.Y.Z or X.Y.Z-rc.N`)
  const [major, minor, patch, rc] = match.slice(1)
  return [Number(major), Number(minor), Number(patch), rc === undefined ? Infinity : Number(rc)]
}

/** A bump from a candidate releases the version it was a candidate for, as npm's semver does. */
function nextVersion(current, bump) {
  const [major, minor, patch, rc] = parse(current)
  const candidate = rc !== Infinity
  if (bump === 'patch') return `${major}.${minor}.${candidate ? patch : patch + 1}`
  if (bump === 'minor') return candidate && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`
  if (bump === 'major') return candidate && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`
  if (bump === 'rc')
    return candidate ? `${major}.${minor}.${patch}-rc.${rc + 1}` : `${major}.${minor}.${patch + 1}-rc.1`
  if (SEMVER.test(bump ?? '')) return bump
  fail('usage: npm run release -- <patch|minor|major|rc|X.Y.Z|X.Y.Z-rc.N> [--push]')
}

function isBelow(a, b) {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i]
  return false
}

/** Exactly one match, so a changed file layout fails loudly instead of skipping the bump. */
function replaceOnce(path, pattern, replacement) {
  const text = readFileSync(path, 'utf8')
  const count = [...text.matchAll(new RegExp(pattern.source, 'gm'))].length
  if (count !== 1) fail(`expected one version line in ${path}, found ${count}`)
  writeFileSync(path, text.replace(pattern, replacement))
}

const args = process.argv.slice(2)
const push = args.includes('--push')
const current = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version
const next = nextVersion(
  current,
  args.find((arg) => arg !== '--push')
)
const tag = `v${next}`

if (isBelow(next, current)) fail(`${next} is below the current ${current}`)
if (git('status', '--porcelain')) fail('the working tree has changes; commit or stash them first')
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists here`)
if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) fail(`tag ${tag} already exists on origin`)

if (next !== current) {
  replaceOnce(PACKAGE_JSON, /^ {2}"version": "[^"]+",$/m, `  "version": "${next}",`)
  replaceOnce(VERSION_TS, /^export const ATC_VERSION = '[^']+'$/m, `export const ATC_VERSION = '${next}'`)
  git('add', PACKAGE_JSON, VERSION_TS)
  git('commit', '--quiet', '-m', `release: ${tag}`)
  console.log(`Bumped ${current} → ${next}`)
}
git('tag', '--annotate', tag, '--message', `atc ${tag}`)

const branch = git('branch', '--show-current')
console.log(`Tagged ${tag} on ${git('rev-parse', '--short', 'HEAD')} (${branch}).`)
const pushArgs = ['push', '--follow-tags', 'origin', 'HEAD']
if (!push) {
  console.log(`\nPublish it:\n  git ${pushArgs.join(' ')}\n`)
} else if (spawnSync('git', pushArgs, { cwd: ROOT, stdio: 'inherit' }).status !== 0) {
  fail(`the push failed; ${tag} is tagged here, retry with: git ${pushArgs.join(' ')}`)
} else {
  console.log(`\nPushed ${branch} and ${tag}. Follow the release: gh run list --workflow release.yml`)
}
