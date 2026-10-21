import { describe, expect, it } from 'vitest'
import { checkFile, comments, corePin, literals, markers } from '../../scripts/check-core-boundary.mjs'

const src = (source: string, pinned = '0.18.5') =>
  checkFile(source, { file: 'src/x.ts', production: true, pinned })

describe('the core boundary', () => {
  it('reads strings and template parts, never comments', () => {
    expect(literals("// Get-Acl\nconst a = 'one'\nconst b = `two ${a} three`").map((l) => l.text)).toEqual([
      'one',
      'two ',
      ' three',
    ])
  })

  it('finds markers in comments only, line and block alike, never in a string that quotes one', () => {
    const source = [
      "const quoted = '// core-workaround: x until core 0.1.0 — y'",
      '/**',
      ' * core-boundary: model.yml — a block comment',
      ' */',
      "const f = 'model.yml' // core-workaround: lspci until core 9.0.0 — trailing",
    ].join('\n')
    expect(comments(source)).toHaveLength(2)
    expect(markers(source).map((m) => [m.kind, m.line, m.name])).toEqual([
      ['boundary', 3, 'model.yml'],
      ['workaround', 5, 'lspci'],
    ])
  })

  it("refuses a string naming the core's mechanism, whatever its case, and says whose it is", () => {
    const [problem] = src("exec('powershell.exe', ['-Command', 'GET-ACL x'])")
    expect(problem).toMatch(/^src\/x\.ts:1: names get-acl, which is the core's \(.*readWindowsAcl/)
    expect(src("const why = 'nothing here'")).toEqual([])
  })

  it('lets a file name it with a reason, and refuses a reason left behind', () => {
    expect(src("// core-boundary: model.yml — only whether it exists\nconst f = 'model.yml'")).toEqual([])
    expect(src('// core-boundary: model.yml — only whether it exists\nconst f = 1')).toEqual([
      'src/x.ts:1: core-boundary names model.yml, which no string here does: remove it',
    ])
    expect(src("// core-boundary: model.yml\nconst f = 'model.yml'")[0]).toMatch(/:1: write it as/)
  })

  it('names nothing in tests, where faking the core is the point', () => {
    expect(
      checkFile("const env = { PSModulePath: 'x', p: 'Get-Acl' }", {
        file: 'src/x.test.ts',
        production: false,
        pinned: '0.18.5',
      })
    ).toEqual([])
  })

  // The PSModulePath workaround atc carried until core 0.18.5 is the case this exists for.
  it('keeps a workaround until the core it waited for is pinned, then asks for it to go', () => {
    const source =
      "// core-workaround: psmodulepath until core 0.18.5 — Get-Acl from pwsh\nconst k = 'PSModulePath'"
    expect(src(source, '0.18.4')).toEqual([])
    expect(src(source, '0.18.5')).toEqual([
      'src/x.ts:1: core 0.18.5 is pinned, and this workaround waited for core 0.18.5: remove it',
    ])
    expect(src(source, '0.19.0')).toHaveLength(1)
    expect(markers('// core-workaround: x until 0.19 — y')[0]?.error).toMatch(/until core X\.Y\.Z/)
  })

  it('wants one exact core version', () => {
    expect(corePin({ dependencies: { '@atomic-chat/core': '0.18.5' } })).toEqual({ pinned: '0.18.5' })
    expect(corePin({ dependencies: { '@atomic-chat/core': '^0.18.5' } }).problem).toMatch(/exact version/)
    expect(corePin({}).problem).toMatch(/undefined/)
  })
})
