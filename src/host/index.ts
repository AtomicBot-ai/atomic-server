/**
 * Host services: running programs, facts about the machine and session, elevation and the
 * host-step protocol, OS services, ports. `nodeHostServices` is the real one;
 * tests build the same shape from fakes.
 */
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { dirname, win32 } from 'node:path'
import { selfCommand } from '@atomic-chat/core/host'
import type { AtcIo } from '../io.js'
import { createElevator } from './elevator.js'
import type { Elevator } from './elevator.js'
import { execCommand, findOnPath } from './exec.js'
import type { ExecFn } from './exec.js'
import { nodeHostFacts } from './facts.js'
import type { HostFacts } from './facts.js'
import { readResultFile } from './host-step.js'
import { probePort } from './ports.js'
import type { ServiceManager } from './service-manager.js'
import { createServiceManager } from './service-plans.js'
import type { ServiceFiles } from './service-plans.js'

export * from './acl.js'
export * from './cloudflared.js'
export * from './exec.js'
export * from './facts.js'
export * from './ports.js'
export * from './managed-types.js'
export * from './elevator.js'
export * from './helper.js'
export * from './host-step.js'
export * from './service-manager.js'
export * from './service-plans.js'

export interface HostServices {
  facts: HostFacts
  exec: ExecFn
  elevator: Elevator
  services: ServiceManager
  /** How to re-run this program. */
  selfCommand: readonly string[]
  probePort: typeof probePort
  findOnPath: (name: string) => string | undefined
}

export function nodeHostServices(io: AtcIo, self: readonly string[] = selfCommand()): HostServices {
  return {
    facts: nodeHostFacts(io),
    exec: execCommand,
    elevator: createElevator({
      exec: execCommand,
      selfCommand: self,
      readResult: readResultFile,
      env: io.env,
    }),
    services: createServiceManager({
      platform: process.platform,
      env: {
        home: homedir(),
        uid: typeof process.getuid === 'function' ? process.getuid() : null,
        windowsPowerShell: win32.join(
          io.env['SystemRoot'] ?? io.env['SYSTEMROOT'] ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe'
        ),
        windowsUser: io.env['USERDOMAIN']
          ? `${io.env['USERDOMAIN']}\\${userInfo().username}`
          : userInfo().username,
      },
      exec: execCommand,
      files: nodeServiceFiles,
    }),
    selfCommand: self,
    probePort,
    findOnPath: (name) => findOnPath(name, io.env),
  }
}

const nodeServiceFiles: ServiceFiles = {
  write: async (path, content, encoding) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, { encoding })
  },
  remove: (path) => rm(path, { force: true }),
  exists: (path) =>
    access(path).then(
      () => true,
      () => false
    ),
}
export * from './server-launch.js'
