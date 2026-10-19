import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..')

// Vitest strips a shebang with a regex whose `.` stops at a CR: on a CRLF checkout (core.autocrlf=true
// on Windows) the `#!` line stays in the module and every test importing the script fails with a
// SyntaxError. Scripts that start with one are pinned to LF on every checkout (as in the core).
it('pins every script that starts with a shebang to LF line endings', () => {
  const scripts = readdirSync(join(ROOT, 'scripts'))
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => readFileSync(join(ROOT, 'scripts', name), 'utf8').startsWith('#!'))
  expect(scripts.length).toBeGreaterThan(0)
  const out = execFileSync('git', ['check-attr', 'eol', '--', ...scripts.map((s) => `scripts/${s}`)], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const unpinned = out
    .trim()
    .split('\n')
    .filter((line) => !line.endsWith(': eol: lf'))
  expect(unpinned).toEqual([])
})
