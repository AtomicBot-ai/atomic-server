/** Run a command in a test: recording I/O, a temporary data folder, and fakes for the core and host. */
import { AtcError } from '../../src/errors/index.js'
import type { CoreLinkFactory, RunCliDeps } from './deps.js'
import { fakeCoreLink } from './fake-core-link.js'
import type { FakeCoreLink } from './fake-core-link.js'
import { recordingIo } from '../../src/io.js'
import type { RecordingIo } from '../../src/io.js'
import { runCli } from '../../src/main.js'
import { tmpDataFolder } from './tmp-data-folder.js'
import type { HostServices } from '../../src/host/index.js'
import { hostFacts } from '../../src/host/index.js'

export interface TestRun {
  io: RecordingIo
  link: FakeCoreLink
  cleanup: () => void
  run(argv: string[]): Promise<number>
}

export function fakeHost(over: Partial<HostServices> = {}): HostServices {
  return {
    facts: hostFacts({
      platform: process.platform,
      arch: process.arch,
      env: {},
      hasTty: false,
      euid: 1000,
      username: 'u',
      homedir: '/home/u',
      hostname: 'h',
      onPath: () => false,
    }),
    exec: async () => ({ code: null, stdout: '', stderr: '', timedOut: false, error: 'fake host' }),
    elevator: { select: () => 'manual', run: async () => ({ kind: 'pending', instructions: 'fake' }) },
    services: {
      kind: 'systemd',
      install: async () => {},
      uninstall: async () => {},
      status: async () => ({ installed: false, running: false, definition: '/fake/atc.service' }),
      start: async () => {},
      stop: async () => {},
      restart: async () => {},
    },
    selfCommand: ['atc'],
    probePort: async () => 'free',
    findOnPath: () => undefined,
    ...over,
  }
}

/** A factory that answers a fake link, or `ATC_DAEMON_NOT_RUNNING` until `launch` is asked for. */
export function fakeCoreFactory(
  link: FakeCoreLink,
  options: { running: boolean } = { running: true }
): CoreLinkFactory & { launched: boolean } {
  const factory = {
    launched: false,
    attach: async (o: { launch?: boolean } = {}) => {
      if (options.running || factory.launched) return link
      if (!o.launch)
        throw new AtcError('ATC_DAEMON_NOT_RUNNING', 'No atc daemon is running for this data folder.')
      factory.launched = true
      return link
    },
  }
  return factory
}

export function testRun(
  options: { running?: boolean; io?: Partial<RecordingIo>; deps?: RunCliDeps } = {}
): TestRun {
  const { paths, cleanup } = tmpDataFolder()
  const io = recordingIo({ env: { ATC_DATA_FOLDER: paths.dataFolder }, ...options.io })
  const link = fakeCoreLink({ data_folder: paths.dataFolder })
  const deps: RunCliDeps = {
    paths,
    core: fakeCoreFactory(link, { running: options.running ?? true }),
    host: fakeHost(),
    ...options.deps,
  }
  return { io, link, cleanup, run: (argv) => runCli(argv, io, deps) }
}
