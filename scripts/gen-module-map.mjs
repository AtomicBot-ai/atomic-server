#!/usr/bin/env node
// The module table in AGENTS.md from the doc comment that opens each `src/<module>/index.ts`, so the
// map can never miss a module or drift from it. `--check` fails when the table is stale or a module's
// entry has no doc comment.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TARGET = join(ROOT, 'AGENTS.md')
const START = '<!-- module-map:start -->'
const END = '<!-- module-map:end -->'

/** The first `/** … *\/` block of a file, as one line of text. */
export function leadingDoc(source) {
  const match = /^\s*\/\*\*([\s\S]*?)\*\//.exec(source)
  if (!match) return undefined
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
}

export function moduleRows(srcDir) {
  const missing = []
  const rows = readdirSync(srcDir)
    .filter((name) => statSync(join(srcDir, name)).isDirectory())
    .sort()
    .map((name) => {
      const doc = leadingDoc(readFileSync(join(srcDir, name, 'index.ts'), 'utf8'))
      if (!doc) missing.push(`src/${name}/index.ts`)
      return `| \`src/${name}/\` | ${(doc ?? '').replaceAll('|', '\\|')} |`
    })
  return { rows, missing }
}

export function renderTable(rows) {
  return [START, '| Module | What it is |', '| --- | --- |', ...rows, END].join('\n')
}

export function replaceBlock(text, block) {
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  if (start < 0 || end < start) throw new Error('AGENTS.md has no module-map markers')
  return text.slice(0, start) + block + text.slice(end + END.length)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, missing } = moduleRows(join(ROOT, 'src'))
  if (missing.length) {
    console.error(`Start these module entries with a /** doc comment */: ${missing.join(', ')}`)
    process.exit(1)
  }
  const current = readFileSync(TARGET, 'utf8')
  const next = replaceBlock(current, renderTable(rows))
  if (process.argv.includes('--check')) {
    if (current !== next) {
      console.error('The module map in AGENTS.md is stale; run `npm run docs:modules`')
      process.exit(1)
    }
    console.log('The module map in AGENTS.md is current')
  } else {
    writeFileSync(TARGET, next)
    console.log(`wrote the module map in ${TARGET}`)
  }
}
