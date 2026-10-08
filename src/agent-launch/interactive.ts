import { spawn } from 'node:child_process'
import type { AgentLaunch } from './plan.js'
/** Called only after Ink returns the terminal to cooked mode. No shell interpolation. */
export async function runAgent(launch: AgentLaunch): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(launch.command, launch.args, {
        env: launch.env,
        cwd: launch.cwd,
        stdio: 'inherit',
        shell: false,
      })
      child.once('error', () =>
        reject(new Error('The agent could not be opened. Check its installation and retry.'))
      )
      child.once('exit', () => resolve())
    })
  } finally {
    await launch.cleanup?.()
  }
}
