/** What a person does after a managed engine's operation needs a new sign-in or a restart of the machine. */

import type { ServerLaunch } from '../../contract/index.js'

/**
 * After the person was added to the `docker` group (`relogin-required`): how the group reaches this
 * server, by the way it was started (design D5). `atc` never signs anyone out or restarts the machine.
 */
export function reloginLines(launch: ServerLaunch, operationId: string, service = 'atc'): string[] {
  const steps: Record<ServerLaunch, string[]> = {
    'terminal': [
      'The server was started from a terminal: sign out and in again (a new SSH session too),',
      'then run `atc restart` from the new session.',
    ],
    'launchd': ['Sign out and in again, then run `atc restart`.'],
    'systemd-user': [
      'The server runs as a systemd --user service, which keeps the groups of your user manager:',
      'end all your sessions (or restart the machine yourself), sign in again,',
      `then \`systemctl --user start ${service}\` if it is not running.`,
    ],
    'systemd-system': [
      `The server runs as a system service: restart it with \`sudo systemctl restart ${service}\`.`,
    ],
  }
  return [
    'You were added to the docker group; it reaches the server only once the server starts again with it.',
    ...steps[launch],
    `The operation then continues by itself; follow it with: atc engines install --resume ${operationId}`,
  ]
}

/** After WSL was turned on (`reboot-required`, Windows): the next start of the server continues. */
export function rebootLines(operationId: string): string[] {
  return [
    'Windows needs a restart to finish turning on WSL.',
    'After the restart, `atc start` (or the service) continues the operation with the import of the distribution;',
    `follow it with: atc engines install --resume ${operationId}`,
  ]
}
