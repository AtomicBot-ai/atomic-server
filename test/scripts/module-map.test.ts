import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leadingDoc, moduleRows, renderTable, replaceBlock } from '../../scripts/gen-module-map.mjs'

describe('the module map', () => {
  it.each([
    ['/** One line. */\nexport {}', 'One line.'],
    ['/**\n * Two\n * lines.\n */\nexport {}', 'Two lines.'],
    ['// A line comment.\nexport {}', undefined],
    ["export * from './a.js'", undefined],
  ])('reads the leading doc comment of %j', (source, doc) => expect(leadingDoc(source)).toBe(doc))

  it('lists every module folder in order and names entries without a comment', () => {
    const src = mkdtempSync(join(tmpdir(), 'atc-modules-'))
    try {
      for (const [name, source] of [
        ['zeta', '/** Last | first. */'],
        ['alpha', '/** First. */'],
        ['bare', "export * from './x.js'"],
      ] as const) {
        mkdirSync(join(src, name))
        writeFileSync(join(src, name, 'index.ts'), source)
      }
      writeFileSync(join(src, 'main.ts'), '')
      expect(moduleRows(src)).toEqual({
        rows: ['| `src/alpha/` | First. |', '| `src/bare/` |  |', '| `src/zeta/` | Last \\| first. |'],
        missing: ['src/bare/index.ts'],
      })
    } finally {
      rmSync(src, { recursive: true, force: true })
    }
  })

  it('replaces only the generated block', () => {
    const text = `before\n${renderTable(['| old |'])}\nafter\n`
    expect(replaceBlock(text, renderTable(['| new |']))).toBe(`before\n${renderTable(['| new |'])}\nafter\n`)
    expect(() => replaceBlock('no markers', 'x')).toThrow(/markers/)
  })
})
