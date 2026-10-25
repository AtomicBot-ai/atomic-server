/**
 * A first model's download that a server stopped in the middle, for a data folder the built program then
 * opens: the record is made by atc's own ModelSetups against a fake Hub (half the file, then held), copied
 * as it was while downloading, so the program reads it as interrupted. Its files and URLs point at a closed
 * loopback port: a resume fails at once instead of reaching the Hub.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fixture, install, weights } from './model-setups-fixture.js'
import { waitFor } from './wait-for.js'

export async function seedInterruptedSetup(dataFolder: string): Promise<{ modelId: string }> {
  const f = fixture()
  const setups = f.make()
  f.hub.hold = true
  try {
    const job = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    const name = `${job.setup_id}.json`
    const record = JSON.parse(
      readFileSync(join(f.tmp.paths.atcDir, 'model-setups', name), 'utf8').replaceAll(
        'https://huggingface.co',
        'http://127.0.0.1:9'
      )
    ) as { stage: string; plan: { model_id: string } }
    record.stage = 'downloading'
    mkdirSync(join(dataFolder, 'atc', 'model-setups'), { recursive: true })
    writeFileSync(join(dataFolder, 'atc', 'model-setups', name), JSON.stringify(record))
    await setups.cancel(job.setup_id)
    return { modelId: record.plan.model_id }
  } finally {
    f.hub.release()
    for (const dispose of cleanup.splice(0)) dispose()
  }
}
