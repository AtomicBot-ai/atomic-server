#!/usr/bin/env node
// The core boundary (AGENTS.md §8): what the core owns, atc takes from the core's exports and never does
// itself. Fails when
// - a string in src/ (tests aside) names a mechanism the core owns, and the file has no
//   `core-boundary: <name> — <reason>` comment saying why atc may name it here;
// - a `core-boundary:` comment names something the file no longer does;
// - a `core-workaround: <name> until core X.Y.Z — <reason>` comment (src/ or test/) is due: the pinned
//   core is X.Y.Z or later, so the core fix it waited for is here and the workaround goes;
// - `@atomic-chat/core` is not pinned to an exact version.
// Only string literals count, never comments, so explaining what the core does is always fine.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ts = createRequire(import.meta.url)('typescript')

/** Names that mean doing the core's work, lower case, with whose export does it instead. */
export const CORE_OWNED = {
  'get-acl': 'the core reads owners and ACLs: readWindowsAcl from @atomic-chat/core/host',
  'psmodulepath': "the core's readWindowsAcl sets Windows PowerShell's module path",
  'nvidia-smi': 'the core is the only source of hardware facts',
  'rocm-smi': 'the core is the only source of hardware facts',
  'vulkaninfo': 'the core is the only source of hardware facts',
  'system_profiler': 'the core is the only source of hardware facts',
  'lspci': 'the core is the only source of hardware facts',
  'wmic': 'the core is the only source of hardware facts',
  'win32_videocontroller': 'the core is the only source of hardware facts',
  'instance.lock':
    "the core's lock: inspectLock, waitForPublishedOwner, attachToOwner from @atomic-chat/core/host",
  'processes.json': "the core's process journal: the core reaps its own engines",
  'control-token': "the core's control token: attachToOwner from @atomic-chat/core/host",
  'version_backend': 'the core applies engine builds: /engines/* (engines.activate)',
  'model.yml': 'ModelRegistry from @atomic-chat/core/models reads and writes model.yml',
}

const SEMVER = /^\d+\.\d+\.\d+$/
const MARKER = /core-(boundary|workaround):(.*)$/gm
const BOUNDARY = /^\s*(\S+)\s+[—-]\s+\S/
const WORKAROUND = /^\s*(\S+)\s+until core (\d+\.\d+\.\d+)\s+[—-]\s+\S/

/** Every string literal and template part in `source`, with its 1-based line. */
export function literals(source, fileName = 'file.ts') {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const found = []
  const visit = (node) => {
    const parts =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? [node]
        : ts.isTemplateExpression(node)
          ? [node.head, ...node.templateSpans.map((span) => span.literal)]
          : []
    for (const part of parts)
      found.push({ text: part.text, line: file.getLineAndCharacterOfPosition(part.getStart(file)).line + 1 })
    node.forEachChild(visit)
  }
  visit(file)
  return found
}

/** Every comment in `source` with the 1-based line it starts on; strings that look like one are not. */
export function comments(source, fileName = 'file.ts') {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const found = new Map()
  const collect = (ranges) => {
    for (const range of ranges ?? [])
      found.set(range.pos, {
        text: source.slice(range.pos, range.end),
        line: file.getLineAndCharacterOfPosition(range.pos).line + 1,
      })
  }
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(source, node.getFullStart()))
    collect(ts.getTrailingCommentRanges(source, node.getEnd()))
    node.forEachChild(visit)
  }
  visit(file)
  collect(ts.getLeadingCommentRanges(source, file.endOfFileToken.getFullStart()))
  return [...found.values()]
}

/** The `core-boundary:` and `core-workaround:` comments of `source`; a malformed one has `error`. */
export function markers(source, fileName = 'file.ts') {
  return comments(source, fileName).flatMap((comment) =>
    [...comment.text.matchAll(MARKER)].map((match) => {
      const line = comment.line + comment.text.slice(0, match.index).split('\n').length - 1
      const [, kind, rest] = match
      const parsed = (kind === 'boundary' ? BOUNDARY : WORKAROUND).exec(rest)
      if (!parsed)
        return {
          kind,
          line,
          error:
            kind === 'boundary'
              ? 'write it as `core-boundary: <name> — <reason>`'
              : 'write it as `core-workaround: <name> until core X.Y.Z — <reason>`',
        }
      return { kind, line, name: parsed[1].toLowerCase(), until: parsed[2] }
    })
  )
}

function below(a, b) {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
  return false
}

/**
 * What is wrong with one file. `production`: a src/ file that is not a test, where core-owned names
 * need a reason; `pinned`: the core version in package.json.
 */
export function checkFile(source, { file, production, pinned }) {
  const problems = []
  const marks = markers(source, file)
  for (const mark of marks) if (mark.error) problems.push(`${file}:${mark.line}: ${mark.error}`)
  const allowed = new Set(marks.filter((mark) => !mark.error).map((mark) => mark.name))

  for (const mark of marks)
    if (mark.kind === 'workaround' && !mark.error && !below(pinned, mark.until))
      problems.push(
        `${file}:${mark.line}: core ${pinned} is pinned, and this workaround waited for core ${mark.until}: remove it`
      )

  if (!production) return problems
  const named = new Set()
  for (const { text, line } of literals(source, file))
    for (const [name, why] of Object.entries(CORE_OWNED))
      if (text.toLowerCase().includes(name)) {
        named.add(name)
        if (!allowed.has(name))
          problems.push(
            `${file}:${line}: names ${name}, which is the core's (${why}). Use the core's export, or say why atc may: \`// core-boundary: ${name} — <reason>\``
          )
      }
  for (const mark of marks)
    if (mark.kind === 'boundary' && !mark.error && !named.has(mark.name))
      problems.push(
        `${file}:${mark.line}: core-boundary names ${mark.name}, which no string here does: remove it`
      )
  return problems
}

/** The pinned core version, or a problem when it is not one exact version. */
export function corePin(pkg) {
  const pin = pkg.dependencies?.['@atomic-chat/core']
  return SEMVER.test(pin ?? '')
    ? { pinned: pin }
    : {
        problem: `package.json: @atomic-chat/core is ${JSON.stringify(pin)}; pin one exact version (docs/release.md)`,
      }
}

function tsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.generated.ts') ? [path] : []
  })
}

function main() {
  const pin = corePin(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')))
  if (pin.problem) {
    console.error(pin.problem)
    process.exit(1)
  }
  const problems = ['src', 'test'].flatMap((top) =>
    tsFiles(join(ROOT, top)).flatMap((path) => {
      const file = relative(ROOT, path)
      const production = top === 'src' && !/\.test\.tsx?$/.test(file)
      return checkFile(readFileSync(path, 'utf8'), { file, production, pinned: pin.pinned })
    })
  )
  if (problems.length > 0) {
    console.error(`The core boundary (AGENTS.md §8):\n${problems.map((p) => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
