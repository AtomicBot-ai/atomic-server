#!/usr/bin/env node
// Module boundaries and relative paths (AGENTS.md §3.1). Fails when
// - a file in src/ reaches into another `src/<module>/` past its index.ts. Folders inside a module are
//   that module's own business, whatever they are called (`src/tui/workspace/downloads/` is not
//   `src/downloads/`), so the check resolves each path instead of matching folder names;
// - a relative path in src/, test/ or the admin SPA names no file. typecheck sees imports, but not a
//   `vi.mock` path (a wrong one mocks nothing and the test loads the real module), a
//   `new URL('…', import.meta.url)` literal, a CSS `@import` or `url()`, or an asset import.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ts = createRequire(import.meta.url)('typescript')

const MOCKS = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'])
const SCRIPT = /\.(ts|tsx)$/
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']

const lineOf = (file, node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node : undefined
const isImportMetaUrl = (node) =>
  node &&
  ts.isPropertyAccessExpression(node) &&
  node.name.text === 'url' &&
  ts.isMetaProperty(node.expression) &&
  node.expression.keywordToken === ts.SyntaxKind.ImportKeyword

/** Every module path a TypeScript source names: imports, re-exports, import(), vi.mock and URL literals. */
export function specifiers(source, fileName = 'file.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const found = []
  const add = (kind, node) => found.push({ kind, text: node.text, line: lineOf(file, node) })
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && literal(node.moduleSpecifier))
      add('import', node.moduleSpecifier)
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      literal(node.argument.literal)
    )
      add('import', node.argument.literal)
    else if (ts.isCallExpression(node)) {
      const [first] = node.arguments
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && literal(first)) add('import', first)
      else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'vi' &&
        MOCKS.has(node.expression.name.text) &&
        literal(first)
      )
        add('mock', first)
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'URL' &&
      literal(node.arguments?.[0]) &&
      isImportMetaUrl(node.arguments?.[1])
    )
      add('url', node.arguments[0])
    node.forEachChild(visit)
  }
  visit(file)
  return found
}

/** The relative paths a stylesheet names: `@import` and `url()`; packages and remote URLs are not paths. */
export function cssSpecifiers(source) {
  const found = []
  // A comment's text is blanked, its line breaks kept, so a commented-out reference is not a path.
  const live = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  live.split('\n').forEach((text, i) => {
    for (const match of text.matchAll(/@import\s+['"]([^'"]+)['"]|url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      const path = match[1] ?? match[2]
      if (path.startsWith('.')) found.push({ kind: 'css', text: path, line: i + 1 })
    }
  })
  return found
}

/** The `src/<module>` a repository path belongs to, or null outside a module folder. */
export function moduleOf(path) {
  const parts = path.split('/')
  return parts[0] === 'src' && parts.length > 2 ? parts[1] : null
}

const toPosix = (path) => path.split(sep).join('/')

/** What a path resolves to, as Node (`.js` naming the `.ts` source) and Vite (no extension) both do. */
function resolve(from, text, kind, stat, aliases) {
  const alias = Object.keys(aliases).find((prefix) => text.startsWith(prefix))
  if (!alias && !text.startsWith('.')) return { external: true }
  const base = alias ? aliases[alias] + text.slice(alias.length) : join(dirname(from), text)
  const path = toPosix(normalize(base))
  const candidates =
    kind === 'url' || kind === 'css'
      ? [path]
      : /\.js$/.test(path)
        ? [path.replace(/\.js$/, '.ts'), path.replace(/\.js$/, '.tsx'), path]
        : /\.[a-z]+$/i.test(path) && !/\.(ts|tsx)$/.test(path)
          ? [path]
          : [path, ...CODE_EXTENSIONS.map((ext) => path + ext)]
  // A URL may name a folder (`new URL('..', import.meta.url)`); a module reference never does.
  return { path: candidates.find((c) => (kind === 'url' ? stat(c) !== null : stat(c) === 'file')) }
}

/** Problems in one file, as `file:line: message`. */
export function checkFile({ file, source, stat, aliases = {} }) {
  const found = file.endsWith('.css') ? cssSpecifiers(source) : specifiers(source, file)
  const from = moduleOf(file)
  const problems = []
  for (const { kind, text, line } of found) {
    const target = resolve(file, text, kind, stat, aliases)
    if (target.external) continue
    if (!target.path) {
      problems.push(`${file}:${line}: ${text} names no file`)
      continue
    }
    const to = moduleOf(target.path)
    if (
      kind === 'import' &&
      file.startsWith('src/') &&
      to &&
      to !== from &&
      !/^src\/[^/]+\/index\.tsx?$/.test(target.path)
    )
      problems.push(`${file}:${line}: ${text} reaches past src/${to}/index.ts`)
  }
  return problems
}

const SKIP = new Set(['node_modules', 'dist', 'coverage'])

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return (SCRIPT.test(entry.name) || entry.name.endsWith('.css')) && !entry.name.endsWith('.generated.ts')
      ? [path]
      : []
  })
}

function main() {
  const stat = (path) => {
    try {
      return statSync(join(ROOT, path)).isDirectory() ? 'dir' : 'file'
    } catch {
      return null
    }
  }
  const problems = ['src', 'test', 'packages/admin-ui/src'].flatMap((top) =>
    sources(join(ROOT, top)).flatMap((path) => {
      const file = toPosix(relative(ROOT, path))
      const aliases = file.startsWith('packages/admin-ui/') ? { '@/': 'packages/admin-ui/src/' } : {}
      return checkFile({ file, source: readFileSync(path, 'utf8'), stat, aliases })
    })
  )
  if (problems.length > 0) {
    console.error(
      `Module boundaries and paths (AGENTS.md §3.1):\n${problems.map((p) => `  ${p}`).join('\n')}`
    )
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
