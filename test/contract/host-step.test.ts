/**
 * A privileged host step from the server's request to the receipt, against the core's real executor.
 * `HostStepExecutor` writes the request (parameters copied, folder 0700, file 0600); the helper runs
 * the executor as if under `sudo` (`SUDO_UID` is this user, so no root is needed: the executor trusts
 * a folder its invoking user owns). The step names a recipe digest this core does not have, so the
 * executor refuses it before touching the machine — after it trusted the folder and parsed the
 * request, which is what this proves. POSIX only: Windows trusts by ACL, not by uid.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  HostStepExecutor,
  HostStepJournal,
  createElevator,
  readResultFile,
  runHostStepHelper,
} from '../../src/host/index.js'
import type { EnvironmentOperationView, ManagedHostReceipt } from '../../src/host/index.js'
import { createLogger } from '../../src/output/index.js'

const root = mkdtempSync(join(tmpdir(), 'atc-host-step-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const hex = (c: string) => `sha256:${c.repeat(64)}` as const
const operation: EnvironmentOperationView = {
  operation_id: 'op-1',
  instance_id: 'me',
  revision: 4,
  phase: 'preparing-host',
  completed_step_ids: [],
  pending_host_step: {
    step_id: 'step-1',
    action: 'linux.install-container-runtime',
    recipe_id: 'linux.install-container-runtime',
    recipe_digest: hex('a'),
    parameters_digest: hex('b'),
    parameters: {
      user: 'alice',
      arch: 'x86_64',
      family: 'apt',
      distro_id: 'ubuntu',
      version_id: '24.04',
      components: ['docker-engine'],
    },
    nonce: 'nonce-1',
    expected_operation_revision: 4,
  },
}

describe.skipIf(process.platform === 'win32')('a host step through the core executor', () => {
  it('is written as the executor trusts it, refused on its digest, and reported with the log', async () => {
    const hostStepsDir = join(root, 'data', 'atc', 'run', 'host-steps')
    const receipts: ManagedHostReceipt[] = []
    const { PKEXEC_UID: _pkexec, ...inherited } = process.env
    const env: NodeJS.ProcessEnv = { ...inherited, SUDO_UID: String(process.getuid!()) }
    const executor = new HostStepExecutor({
      hostStepsDir,
      journal: new HostStepJournal(join(root, 'journal.json')),
      dataFolder: join(root, 'data'),
      instanceId: 'me',
      // The helper in-process, as `sudo atc host-step exec` would run it.
      elevator: createElevator(
        {
          exec: async (_cmd, args) => {
            await runHostStepHelper(args.at(-1)!, { platform: process.platform, env })
            return { code: 1, stdout: '', stderr: '', timedOut: false }
          },
          selfCommand: ['atc'],
          readResult: readResultFile,
        },
        process.platform
      ),
      context: {
        platform: process.platform,
        isRoot: false,
        isElevatedWindows: null,
        hasTty: true,
        hasDisplay: false,
        hasPkexec: false,
        hasSudo: true,
        inDaemon: false,
      },
      post: async (_op, receipt) => void receipts.push(receipt),
      log: createLogger(() => {}, { level: 'silent' }),
      newId: () => 'receipt-1',
    })
    expect(await executor.handle(operation)).toBe('posted')

    const request = join(hostStepsDir, 'step-1.request.json')
    expect(statSync(hostStepsDir).mode & 0o777).toBe(0o700)
    expect(statSync(request).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(request, 'utf8'))).toMatchObject({ parameters: { user: 'alice' } })

    const result = JSON.parse(readFileSync(join(hostStepsDir, 'step-1.result.json'), 'utf8')) as {
      outcome: string
      error_code?: string
      log_tail: string
    }
    expect(result.outcome).toBe('failed')
    // Refused for the recipe, not for the folder or the shape of the request.
    expect(result.log_tail).not.toMatch(/trusted|owned by|must be a/)
    expect(result.log_tail).toMatch(/recipe|digest/i)
    expect(receipts).toEqual([
      expect.objectContaining({
        step_id: 'step-1',
        outcome: 'failed',
        nonce: 'nonce-1',
        log_tail: result.log_tail,
      }),
    ])
    expect(existsSync(join(hostStepsDir, 'step-1.result.json'))).toBe(true)
  })
})
