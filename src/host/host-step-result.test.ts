import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { readResultFile } from './host-step.js'

it('does not send an FLM service restart result through the Docker/WSL receipt protocol', async () => {
  const { paths, cleanup } = tmpDataFolder()
  try {
    await mkdir(paths.dataFolder, { recursive: true })
    const request = join(paths.dataFolder, 'flm-step.request.json')
    await writeFile(
      join(paths.dataFolder, 'flm-step.result.json'),
      JSON.stringify({
        schema_version: 1,
        step_id: 'flm-step',
        outcome: 'service-restart-required',
        exit_code: 0,
        log_tail: '',
        finished_at: 1,
      })
    )
    expect(await readResultFile(request)).toBeUndefined()
  } finally {
    cleanup()
  }
})
