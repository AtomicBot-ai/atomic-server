import { describe, expect, it } from 'vitest'
import { checkFile, cssSpecifiers, moduleOf, specifiers } from '../../scripts/check-module-boundaries.mjs'

const FILES = new Set([
  'src/a/index.ts',
  'src/a/x.ts',
  'src/a/downloads/y.ts',
  'src/a/deep/z.tsx',
  'src/a/data.json',
  'src/b/index.ts',
  'src/b/inner.ts',
  'src/b/sub/index.ts',
  'src/downloads/index.ts',
  'src/main.ts',
  'test/fixtures/catalog.json',
  'test/fixtures/',
  'packages/admin-ui/src/workspace/library/',
  'packages/admin-ui/src/workspace/useWorkspace.ts',
  'packages/admin-ui/src/workspace/library/Catalog.tsx',
  'packages/admin-ui/src/workspace/library/catalog.css',
  'packages/admin-ui/src/workspace/styles/layout.css',
  'packages/admin-ui/src/hooks/useServiceHub.ts',
  'packages/admin-ui/src/logo.svg',
])
const check = (file: string, source: string) =>
  checkFile({
    file,
    source,
    stat: (path: string) => (FILES.has(path) ? 'file' : FILES.has(`${path}/`) ? 'dir' : null),
    aliases: { '@/': 'packages/admin-ui/src/' },
  })

describe('module boundaries and relative paths', () => {
  it('reads every kind of specifier with its line', () => {
    const source = [
      "import { a } from './a.js'",
      "export { b } from './b.js'",
      "import type { C } from './c.js'",
      "const d = await import('./d.js')",
      "type E = typeof import('./e.js')",
      "vi.mock('./f.js', () => ({}))",
      "vi.doMock('./g.js')",
      "const h = await vi.importActual('./h.js')",
      "const i = new URL('../fixtures/i.json', import.meta.url)",
      "import './j.css'",
      "const notAPath = new URL('https://example.test')",
    ].join('\n')
    expect(specifiers(source).map((s) => [s.kind, s.text, s.line])).toEqual([
      ['import', './a.js', 1],
      ['import', './b.js', 2],
      ['import', './c.js', 3],
      ['import', './d.js', 4],
      ['import', './e.js', 5],
      ['mock', './f.js', 6],
      ['mock', './g.js', 7],
      ['mock', './h.js', 8],
      ['url', '../fixtures/i.json', 9],
      ['import', './j.css', 10],
    ])
  })

  it('reads @import and relative url() in CSS, never a package or a remote url', () => {
    const css =
      "@import 'tailwindcss';\n@import './layout.css';\n.a { background: url(../logo.svg) }\n.b { background: url('https://x.test/y.png') }"
    expect(cssSpecifiers(css).map((s) => [s.text, s.line])).toEqual([
      ['./layout.css', 2],
      ['../logo.svg', 3],
    ])
  })

  it.each([
    ['src/a/x.ts', 'a'],
    ['src/a/deep/z.tsx', 'a'],
    ['src/main.ts', null],
    ['test/scripts/x.test.ts', null],
    ['packages/admin-ui/src/workspace/x.ts', null],
  ])('places %s in module %s', (file, module) => expect(moduleOf(file)).toBe(module))

  it('lets a module reach another one through its index.ts only', () => {
    expect(check('src/a/x.ts', "import { b } from '../b/index.js'")).toEqual([])
    expect(check('src/a/x.ts', "import { b } from '../b/inner.js'")).toEqual([
      'src/a/x.ts:1: ../b/inner.js reaches past src/b/index.ts',
    ])
    expect(check('src/a/deep/z.tsx', "export * from '../../b/inner.js'")).toEqual([
      'src/a/deep/z.tsx:1: ../../b/inner.js reaches past src/b/index.ts',
    ])
    expect(check('src/a/x.ts', "import { s } from '../b/sub/index.js'")).toEqual([
      'src/a/x.ts:1: ../b/sub/index.js reaches past src/b/index.ts',
    ])
    expect(check('src/main.ts', "import { b } from './b/inner.js'")).toEqual([
      'src/main.ts:1: ./b/inner.js reaches past src/b/index.ts',
    ])
  })

  it('treats folders inside a module as its own business, even one named like another module', () => {
    expect(check('src/a/deep/z.tsx', "import { y } from '../downloads/y.js'")).toEqual([])
    expect(
      check('src/a/x.ts', "import { y } from './downloads/y.js'\nimport { z } from './deep/z.js'")
    ).toEqual([])
  })

  it('refuses a relative path that names no file, whatever kind of reference it is', () => {
    expect(
      check(
        'src/a/x.ts',
        [
          "import { m } from './missing.js'",
          "vi.mock('./gone.js')",
          "const f = new URL('../../test/fixtures/nope.json', import.meta.url)",
          "import data from './data.json' with { type: 'json' }",
          "const dir = new URL('../../test/fixtures', import.meta.url)",
        ].join('\n')
      )
    ).toEqual([
      'src/a/x.ts:1: ./missing.js names no file',
      'src/a/x.ts:2: ./gone.js names no file',
      'src/a/x.ts:3: ../../test/fixtures/nope.json names no file',
    ])
  })

  it('resolves the admin SPA as its bundler does: no extension, tsx, css, assets and the @/ alias', () => {
    const file = 'packages/admin-ui/src/workspace/library/Catalog.tsx'
    expect(
      check(
        file,
        [
          "import { useWorkspace } from '../useWorkspace'",
          "import './catalog.css'",
          "import logo from '../../logo.svg'",
          "vi.mock('@/hooks/useServiceHub')",
          "vi.mock('@/hooks/useGone')",
          "import { x } from '../Moved'",
          "import { cn } from 'clsx'",
        ].join('\n')
      )
    ).toEqual([`${file}:5: @/hooks/useGone names no file`, `${file}:6: ../Moved names no file`])
  })

  it('never takes a folder for a module file', () => {
    const file = 'packages/admin-ui/src/workspace/useWorkspace.ts'
    expect(check(file, "import { C } from './library'\nvi.mock('./library')")).toEqual([
      `${file}:1: ./library names no file`,
      `${file}:2: ./library names no file`,
    ])
  })

  it('reads a .ts file as TypeScript, so a generic arrow does not hide what follows', () => {
    expect(check('src/a/x.ts', "const id = <T>(x: T) => x\nconst m = await import('./missing.js')")).toEqual([
      'src/a/x.ts:2: ./missing.js names no file',
    ])
  })

  it('ignores paths inside CSS comments', () => {
    const file = 'packages/admin-ui/src/workspace/library/catalog.css'
    expect(check(file, "/* old:\n@import './legacy.css'; */\n@import './gone.css';")).toEqual([
      `${file}:3: ./gone.css names no file`,
    ])
  })

  it('checks CSS files too', () => {
    const file = 'packages/admin-ui/src/workspace/library/catalog.css'
    expect(check(file, "@import '../styles/layout.css';\n@import './gone.css';")).toEqual([
      `${file}:2: ./gone.css names no file`,
    ])
  })
})
