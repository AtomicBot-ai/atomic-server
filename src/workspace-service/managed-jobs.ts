/** The job records of one kind in a setups folder (one JSON document per request id). */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readDocument } from '../terminal-data/index.js'

export async function listJobs<J extends { kind: string; plan: unknown }>(
  directory: string,
  kind: J['kind'],
  view: (job: J) => J
): Promise<J[]> {
  const names = await readdir(directory).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return [] as string[]
    throw e
  })
  const docs = (await Promise.all(
    names.filter((n) => /^[\w-]+\.json$/.test(n)).map((n) => readDocument<unknown>(join(directory, n), null))
  )) as Array<J | null>
  return docs.filter((d): d is J => d?.kind === kind && !!d.plan).map(view)
}
