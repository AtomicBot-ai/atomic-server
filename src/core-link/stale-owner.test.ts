import { existsSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeOldOwner } from '../../test/helpers/fake-old-owner.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { findOutdatedOwner, outdatedError, planStaleStop, stopOutdatedOwner } from './stale-owner.js'
import type { OutdatedOwner, OwnerView } from './stale-owner.js'

const owner = {
  lock: { instance_id: 'i1', pid: 42, protocol: 2, version: '0.0.1' },
  record: undefined,
} as unknown as OutdatedOwner

const snap = (clients: string[] = [], instance_id = 'i1'): OwnerView => ({
  kind: 'snapshot',
  instance_id,
  clients,
})

describe('planStaleStop', () => {
  it.each([
    ['no clients', snap(), { force: false, kill: false }, 'shutdown'],
    ['clients, no --force', snap(['atc tui']), { force: false, kill: false }, 'refuse'],
    ['clients, --force', snap(['atc tui']), { force: true, kill: false }, 'shutdown'],
    ['another instance answered', snap([], 'i2'), { force: true, kill: true }, 'refuse'],
    ['unreachable', { kind: 'unreachable' } as OwnerView, { force: false, kill: false }, 'refuse'],
    ['unreachable, --kill', { kind: 'unreachable' } as OwnerView, { force: false, kill: true }, 'kill'],
    ['unknown protocol', { kind: 'unknown-protocol' } as OwnerView, { force: true, kill: false }, 'refuse'],
    [
      'unknown protocol, --kill',
      { kind: 'unknown-protocol' } as OwnerView,
      { force: false, kill: true },
      'kill',
    ],
  ])('%s → %s', (_name, view, flags, kind) => {
    expect(planStaleStop(owner, view, flags).kind).toBe(kind)
  })

  it('forces the shutdown only when it has to', () => {
    expect(planStaleStop(owner, snap(), { force: true, kill: false })).toEqual({
      kind: 'shutdown',
      force: false,
    })
    expect(planStaleStop(owner, snap(['x']), { force: true, kill: false })).toEqual({
      kind: 'shutdown',
      force: true,
    })
  })

  it('names the clients and the flag that overrides them', () => {
    const plan = planStaleStop(owner, snap(['atc tui', 'atc chat']), { force: false, kill: false })
    expect(plan).toMatchObject({
      kind: 'refuse',
      error: { code: 'ATC_DAEMON_ALREADY_RUNNING', details: 'atc tui, atc chat', hint: 'retry with --force' },
    })
  })
})

describe('outdatedError', () => {
  it('names both builds and the way out', () => {
    const e = outdatedError({ ...owner, record: { atc_version: '0.0.9' } } as OutdatedOwner)
    expect(e.code).toBe('ATC_DAEMON_OUTDATED')
    expect(e.message).toContain('atc 0.0.9, core 0.0.1')
    expect(e.hint).toContain('atc restart')
  })
})

describe('the old owner over its control API', () => {
  const cleanups: Array<() => unknown> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
  })
  const setup = async (options: Parameters<typeof fakeOldOwner>[1] = {}) => {
    const t = tmpDataFolder('atc-stale-')
    cleanups.push(t.cleanup)
    const old = await fakeOldOwner(t.paths, options)
    cleanups.push(old.close)
    return { paths: t.paths, old }
  }

  it('finds a ready CLI owner of another core version, with its atc record', async () => {
    const { paths, old } = await setup()
    const found = await findOutdatedOwner(paths)
    expect(found?.lock).toMatchObject({ instance_id: old.instanceId, version: '0.0.1' })
    expect(found?.record?.atc_version).toBe('0.0.9')
  })

  it('finds nothing in an empty folder', async () => {
    const t = tmpDataFolder('atc-stale-')
    cleanups.push(t.cleanup)
    expect(await findOutdatedOwner(t.paths)).toBeUndefined()
  })

  it('asks it to shut down and waits for the lock to go', async () => {
    const { paths, old } = await setup()
    const found = (await findOutdatedOwner(paths))!
    await stopOutdatedOwner({ paths, owner: found, force: false, kill: false, now: () => new Date() })
    expect(old.shutdowns).toEqual([{}])
    expect(existsSync(paths.layout.core.instanceLock)).toBe(false)
  })

  it('refuses while clients are attached, and forces with --force', async () => {
    const { paths, old } = await setup({ clients: ['atc tui'] })
    const found = (await findOutdatedOwner(paths))!
    const stop = (force: boolean) =>
      stopOutdatedOwner({ paths, owner: found, force, kill: false, now: () => new Date() })
    await expect(stop(false)).rejects.toMatchObject({ code: 'ATC_DAEMON_ALREADY_RUNNING' })
    expect(old.shutdowns).toEqual([])
    await stop(true)
    expect(old.shutdowns).toEqual([{ force: true }])
  })

  it('does not speak to an unknown protocol, but ends the pid with --kill', async () => {
    const { paths, old } = await setup({ protocol: 99 })
    const found = (await findOutdatedOwner(paths))!
    await expect(
      stopOutdatedOwner({ paths, owner: found, force: true, kill: false, now: () => new Date() })
    ).rejects.toMatchObject({ code: 'ATC_DAEMON_OUTDATED', hint: 'retry with --kill to end the process' })
    const killed: number[] = []
    const lock = paths.layout.core.instanceLock
    await stopOutdatedOwner({
      paths,
      owner: found,
      force: false,
      kill: true,
      now: () => new Date(),
      killProcess: async (pid) => {
        killed.push(pid)
        rmSync(lock, { force: true })
      },
    })
    expect(killed).toEqual([process.pid])
    expect(old.shutdowns).toEqual([])
  })

  it('kills after a shutdown that does not release the lock, only with --kill', async () => {
    const { paths } = await setup({ ignoreShutdown: true })
    const found = (await findOutdatedOwner(paths))!
    await expect(
      stopOutdatedOwner({
        paths,
        owner: found,
        force: false,
        kill: false,
        now: () => new Date(),
        timeoutMs: 300,
      })
    ).rejects.toMatchObject({ code: 'ATC_DAEMON_ALREADY_RUNNING', hint: 'retry with --kill' })
  })
})
