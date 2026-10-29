import { basename, dirname, join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ExecResult } from '../host/index.js'
import { applyUpdate, executeReplace } from './apply.js'
import type { ApplyDeps, UpdateFiles } from './apply.js'
import { planReplace } from './replace-plan.js'

const HASH = 'a'.repeat(64)
// The updater joins paths with node:path, so the fixture uses this platform's separators.
const DIR = join(sep, 'opt', 'atc')
const BIN = join(DIR, 'atc')
const NAME = 'atc-0.2.0-x86_64-unknown-linux-gnu'
const ok = (over: Partial<ExecResult> = {}): ExecResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
})

function release(over: { tag?: string; sums?: string; assets?: string[] } = {}) {
  const tag = over.tag ?? 'v0.2.0'
  const names = over.assets ?? [NAME, 'SHA256SUMS']
  const json = {
    tag_name: tag,
    html_url: `https://example/${tag}`,
    assets: names.map((n) => ({ name: n, browser_download_url: `https://dl/${n}`, size: 1 })),
  }
  return async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/releases/')) return new Response(JSON.stringify(json))
    if (u.endsWith('/SHA256SUMS')) return new Response(over.sums ?? `${HASH}  ${NAME}\n`)
    return new Response('', { status: 404 })
  }
}

/** An in-memory folder with the installed binary at BIN. */
function folder(downloaded = HASH) {
  const files = new Map<string, string>([[BIN, 'old']])
  const ops: string[] = []
  const fs: UpdateFiles = {
    download: async (_url, path) => {
      files.set(path, 'new')
      ops.push(`download ${path}`)
      return downloaded
    },
    rename: async (from, to) => {
      const body = files.get(from)
      if (body === undefined) throw new Error(`ENOENT ${from}`)
      files.delete(from)
      files.set(to, body)
      ops.push(`rename ${from} → ${to}`)
    },
    chmod: async (path) => void ops.push(`chmod ${path}`),
    remove: async (path) => void files.delete(path),
    list: async (dir) =>
      [...files.keys()].filter((p) => p.startsWith(`${dir}${sep}`)).map((p) => p.slice(dir.length + 1)),
  }
  return { files, ops, fs }
}

function deps(
  over: Partial<ApplyDeps> & { version?: string } = {}
): ApplyDeps & { f: ReturnType<typeof folder> } {
  const f = folder()
  return {
    fetch: release() as typeof fetch,
    exec: async (_command, args) =>
      args[0] === '--version' ? ok({ stdout: `${over.version ?? '0.2.0'}\n` }) : ok(),
    files: f.fs,
    platform: 'linux',
    arch: 'x64',
    execPath: BIN,
    builtFor: 'x86_64-unknown-linux-gnu',
    currentVersion: '0.1.0',
    now: () => new Date('2026-10-09T12:00:00Z'),
    f,
    ...over,
  }
}

const only = (d: ReturnType<typeof deps>) => [...d.f.files.keys()]

describe('applyUpdate', () => {
  it('downloads beside the binary, verifies it and renames it over the old one', async () => {
    const d = deps()
    const r = await applyUpdate(d)
    expect(r).toMatchObject({ updated: true, from: '0.1.0', to: '0.2.0' })
    expect(d.f.files.get(BIN)).toBe('new')
    expect(only(d)).toEqual([BIN])
    const [verb, download = ''] = d.f.ops[0]?.split(' ') ?? []
    expect(verb).toBe('download')
    expect(dirname(download)).toBe(DIR)
    expect(basename(download)).toMatch(/^\.atc\.download\.\d+$/)
  })

  it('does nothing when already on the latest, unless asked for a version or forced', async () => {
    const d = deps({ currentVersion: '0.2.0' })
    expect(await applyUpdate(d)).toMatchObject({ updated: false })
    expect(d.f.ops).toEqual([])
    expect((await applyUpdate(deps({ currentVersion: '0.2.0' }), { force: true })).updated).toBe(true)
  })

  it('fetches the same variant this binary was built as', async () => {
    const baseline = 'atc-0.2.0-x86_64-unknown-linux-gnu-baseline'
    const d = deps({
      builtFor: 'x86_64-unknown-linux-gnu-baseline',
      fetch: release({
        assets: [NAME, baseline, 'SHA256SUMS'],
        sums: `${'b'.repeat(64)}  ${NAME}\n${HASH}  ${baseline}\n`,
      }) as typeof fetch,
    })
    expect((await applyUpdate(d)).updated).toBe(true)
  })

  it.each([
    ['running from source', { builtFor: undefined }, 'runs from source'],
    ['a package installed it', { installSource: 'deb' }, 'installed by the deb package'],
    [
      'no asset for this machine',
      { fetch: release({ assets: ['SHA256SUMS'] }) as typeof fetch },
      `has no ${NAME}`,
    ],
    ['SHA256SUMS does not list it', { fetch: release({ sums: '' }) as typeof fetch }, 'does not list'],
    ['the download does not match', { files: folder('f'.repeat(64)).fs }, 'does not match SHA256SUMS'],
    ['it does not run as the release', { version: '0.1.9' }, 'does not run as atc 0.2.0'],
  ] as const)(
    'refuses when %s, leaving the installed binary and no download',
    async (_name, over, message) => {
      const d = deps(over as Partial<ApplyDeps>)
      await expect(applyUpdate(d)).rejects.toThrow(message)
      expect(d.f.files.get(BIN)).toBe('old')
      expect(only(d)).toEqual([BIN])
    }
  )

  it('refuses a binary signed by another team than the installed one', async () => {
    const d = deps({
      platform: 'darwin',
      arch: 'arm64',
      builtFor: 'aarch64-apple-darwin',
      fetch: release({
        assets: ['atc-0.2.0-aarch64-apple-darwin', 'SHA256SUMS'],
        sums: `${HASH}  atc-0.2.0-aarch64-apple-darwin\n`,
      }) as typeof fetch,
      exec: async (_c, args) => {
        if (args[0] === '-dv')
          return ok({
            stderr: `TeamIdentifier=${String(args[2]).includes('download') ? 'MALLORY' : 'ATOMIC'}\n`,
          })
        return args[0] === '--version' ? ok({ stdout: '0.2.0\n' }) : ok()
      },
    })
    await expect(applyUpdate(d)).rejects.toThrow('not signed by team ATOMIC')
    expect(d.f.files.get(BIN)).toBe('old')
  })

  it('refuses when the signature probe cannot run, leaving the installed binary', async () => {
    const d = deps({
      platform: 'darwin',
      arch: 'arm64',
      builtFor: 'aarch64-apple-darwin',
      fetch: release({
        assets: ['atc-0.2.0-aarch64-apple-darwin', 'SHA256SUMS'],
        sums: `${HASH}  atc-0.2.0-aarch64-apple-darwin\n`,
      }) as typeof fetch,
      exec: async (_command, args) =>
        args[0] === '--version' ? ok({ stdout: '0.2.0\n' }) : ok({ code: null, error: 'ENOENT' }),
    })
    await expect(applyUpdate(d)).rejects.toThrow('could not be read')
    expect(d.f.files.get(BIN)).toBe('old')
    expect(only(d)).toEqual([BIN])
  })
})

describe('executeReplace on Windows', () => {
  it('moves the running binary aside, puts the new one in place, and clears old copies', async () => {
    const f = folder()
    f.files.set(`${BIN}.old-20260101000000`, 'older')
    f.files.set(join(DIR, '.atc.download.1'), 'new')
    await executeReplace(planReplace('win32', BIN, join(DIR, '.atc.download.1'), '20261009120000'), f.fs)
    expect([...f.files.entries()]).toEqual([[BIN, 'new']])
  })

  it('puts the old binary back when the new one cannot be moved in', async () => {
    const f = folder()
    await expect(
      executeReplace(planReplace('win32', BIN, join(DIR, 'missing'), '20261009120000'), f.fs)
    ).rejects.toThrow('installed one is unchanged')
    expect(f.files.get(BIN)).toBe('old')
  })
})
