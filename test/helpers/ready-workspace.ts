import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
/** A returning-user fixture; first-run tests deliberately omit it. */
export function readyWorkspace(dataFolder: string): void {
  mkdirSync(join(dataFolder, 'atc'), { recursive: true })
  writeFileSync(
    join(dataFolder, 'atc/setup.json'),
    JSON.stringify({
      version: 1,
      complete: true,
      mode: 'personal',
      startedAt: 1,
      engine: { provider: 'llamacpp-upstream', version: 'fixture', backend: 'cpu', taskId: 'fixture' },
      selections: [],
    })
  )
}
