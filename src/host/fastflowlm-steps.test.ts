import { expect, it } from 'vitest'
import { elevatedCommand, manualInstructions } from './elevator.js'
it('binds every elevated and manual FLM invocation to the separately supplied request digest', () => {
  const digest = 'a'.repeat(64)
  for (const strategy of ['root', 'sudo-tty', 'pkexec', 'windows-runas'] as const) {
    const command = elevatedCommand(strategy, ['/atc'], '/private/step.request.json', {}, digest)
    expect(command.args.join(' ')).toContain('--request-sha256')
    expect(command.args.join(' ')).toContain(digest)
  }
  expect(manualInstructions(['/atc'], '/private/step.request.json', 'linux', digest)).toContain(digest)
})

import { afterEach, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FastFlowLmHostSteps } from './fastflowlm-steps.js'
import type { Elevator, ElevationContext } from './elevator.js'
import type { FastFlowLmOperation } from '@atomic-chat/core/contracts'
import operation from '../../test/fixtures/fastflowlm/operation.json' with { type: 'json' }
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { resultPathFor } from '@atomic-chat/core/host'
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})
function fixture() {
  const { paths, cleanup } = tmpDataFolder()
  cleanups.push(cleanup)
  const link = fakeCoreLink(),
    op = structuredClone(operation) as FastFlowLmOperation
  const context: ElevationContext = {
    platform: 'linux',
    isRoot: false,
    hasTty: false,
    isElevatedWindows: false,
    hasDisplay: false,
    hasPkexec: false,
    hasSudo: false,
    inDaemon: true,
  }
  const run = vi.fn<Elevator['run']>(async () => ({ kind: 'pending', instructions: 'sudo approved-helper' }))
  const elevator: Elevator = { select: () => 'manual', run }
  const deps = { atcDir: paths.atcDir, dataFolder: paths.dataFolder, link, context, elevator }
  const runner = new FastFlowLmHostSteps(deps)
  const result = {
    ...op.pending_host_step!,
    operation_id: op.operation_id,
    schema_version: 1,
    error_code: null,
    log_tail: '',
    exit_code: 0,
    outcome: 'completed',
  }
  link.responses['POST /runtimes/fastflowlm/operations/' + op.operation_id + '/claim-host-step'] = op
  link.responses['GET /runtimes/fastflowlm/operations/' + op.operation_id] = op
  const unclaimed = () => ({ ...op, pending_host_step: null, revision: op.revision - 1 })
  return { runner, deps, paths, link, op, run, result, unclaimed }
}
it('keeps memory authorization for the terminal without a manual command, then launches once', async () => {
  const f = fixture()
  f.op.pending_host_step = {
    ...f.op.pending_host_step!,
    action: 'linux.configure-runtime-memlock',
    parameters: {
      runtime_account: 'atomic',
      runtime_mode: 'interactive',
      runtime_service: null,
      runtime_process: { pid: 4207, start_ticks: '123', boot_id: '11111111-1111-1111-1111-111111111111' },
    },
  }
  await f.runner.handle(f.unclaimed())
  const [entry] = await f.runner.pending()
  expect(entry?.instructions).toContain('terminal UI')
  expect(entry?.instructions).not.toContain('sudo')
  expect(f.run).not.toHaveBeenCalled()
  f.deps.elevator.select = () => 'sudo-tty'
  f.run.mockImplementation(async (_strategy, path) => {
    await writeFile(resultPathFor(path)!, JSON.stringify({ ...f.result, ...f.op.pending_host_step }))
    return {
      kind: 'result',
      result: { ...f.result, schema_version: 1, outcome: 'completed', finished_at: 1 },
    }
  })
  await f.runner.handle(f.op)
  await new FastFlowLmHostSteps(f.deps).handle(f.op)
  expect(f.run).toHaveBeenCalledTimes(1)
})
it('recovers a manual receipt after cancellation without relaunching, using the bound step revision', async () => {
  const f = fixture()
  await f.runner.handle(f.unclaimed())
  const [step] = await f.runner.pending()
  expect(step?.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.parse(await readFile(step!.request_path, 'utf8'))).toMatchObject({
    parameters: {
      runtime_account: 'atomic',
      runtime_service: 'atomic-chat.service',
      runtime_mode: 'system-service',
    },
  })
  await writeFile(resultPathFor(step!.request_path)!, JSON.stringify(f.result))
  await new FastFlowLmHostSteps(f.deps).handle({ ...f.op, revision: 4, reason: 'cancellation-requested' })
  expect(f.run).toHaveBeenCalledTimes(1)
  expect(f.link.calls.find((c) => c.path?.endsWith('/host-step-receipt'))?.body).toMatchObject({
    nonce: f.op.pending_host_step!.nonce,
  })
  expect(await f.runner.pending()).toEqual([])
})
it('rejects a substituted result and preserves the pending step', async () => {
  const f = fixture()
  await f.runner.handle(f.unclaimed())
  const [step] = await f.runner.pending()
  await writeFile(resultPathFor(step!.request_path)!, JSON.stringify({ ...f.result, nonce: 'wrong' }))
  await expect(f.runner.handle(f.op)).rejects.toThrow()
  expect(f.link.calls.some((c) => c.path?.endsWith('/host-step-receipt'))).toBe(false)
})
it('launches a privileged transaction only once across competing runners', async () => {
  const f = fixture()
  f.deps.elevator.select = () => 'root'
  f.run.mockImplementation(async (_, path) => {
    await writeFile(resultPathFor(path)!, JSON.stringify(f.result))
    return {
      kind: 'result',
      result: {
        schema_version: 1,
        step_id: 'step-1',
        exit_code: 0,
        outcome: 'completed',
        log_tail: '',
        finished_at: 0,
      },
    }
  })
  await Promise.all([f.runner.handle(f.unclaimed()), new FastFlowLmHostSteps(f.deps).handle(f.unclaimed())])
  await new FastFlowLmHostSteps(f.deps).handle(f.op)
  expect(f.run).toHaveBeenCalledTimes(1)
  expect(await readFile(join(f.runner.directory, 'step-1.request.json'), 'utf8')).toContain(
    'atomic-chat.service'
  )
})
it('submits a bound UAC-declined receipt without treating it as a successful helper result', async () => {
  const f = fixture()
  f.op.pending_host_step!.action = 'windows.install-amd-npu'
  f.deps.elevator.select = () => 'windows-runas'
  f.run.mockResolvedValue({
    kind: 'result',
    result: {
      schema_version: 1,
      step_id: '',
      outcome: 'declined',
      exit_code: 1223,
      log_tail: 'UAC declined',
      finished_at: 0,
    },
  })
  await f.runner.handle(f.unclaimed())
  expect(f.link.calls.find((c) => c.path?.endsWith('/host-step-receipt'))?.body).toMatchObject({
    outcome: 'declined',
    nonce: f.op.pending_host_step!.nonce,
  })
})
it('does not launch from an already claimed snapshot without a local authorization record', async () => {
  const f = fixture()
  f.deps.elevator.select = () => 'root'
  await f.runner.handle(f.op)
  expect(f.run).not.toHaveBeenCalled()
  expect((await f.runner.pending())[0]?.instructions).toContain('claimed')
})
it('does not offer a manual replay while an automatic launch is in progress', async () => {
  const f = fixture()
  f.deps.elevator.select = () => 'root'
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  f.run.mockImplementation(async () => {
    await waiting
    return { kind: 'pending', instructions: 'waiting' }
  })
  const launched = f.runner.handle(f.unclaimed())
  await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1))
  const manual = vi.fn<Elevator['run']>(async () => ({
    kind: 'pending',
    instructions: 'sudo duplicate-helper',
  }))
  try {
    await new FastFlowLmHostSteps({ ...f.deps, elevator: { select: () => 'manual', run: manual } }).handle(
      f.op
    )
    expect(manual).not.toHaveBeenCalled()
    expect((await f.runner.pending())[0]?.instructions).toContain('already launched')
  } finally {
    release()
    await launched
  }
})
it.each(['cancelled', 'replaced'])(
  'hides manual instructions when their pending step is %s',
  async (change) => {
    const f = fixture()
    await f.runner.handle(f.unclaimed())
    f.link.responses['GET /runtimes/fastflowlm/operations/' + f.op.operation_id] = {
      ...f.op,
      ...(change === 'cancelled'
        ? { reason: 'cancellation-requested' }
        : { pending_host_step: { ...f.op.pending_host_step, step_id: 'replacement-step' } }),
    }
    expect(await f.runner.pending()).toEqual([])
  }
)
