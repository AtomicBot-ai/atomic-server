/** The server log and the engines log, read for `logs` and `models.logs`: tails, with secrets hidden. */
import { readFile } from 'node:fs/promises'

async function readLog(path: string): Promise<string> {
  return readFile(path, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return ''
    throw e
  })
}

export async function workspaceLogs(path: string, count: number) {
  const value = await readLog(path)
  return {
    lines: value
      .split('\n')
      .slice(-count)
      .map((line) =>
        line.replace(/atc_[a-f0-9]{64}/g, '[API key]').replace(/(Bearer\s+)\S+/gi, '$1[redacted]')
      ),
  }
}

/**
 * One model's last `count` lines of the engines log (`<time> [info] <provider>/<model>: [stream] line`),
 * as the engine printed them; `''` when the file or the model has none.
 */
export async function engineLogTail(path: string, provider: string, model: string, count: number) {
  const prefix = ` ${provider}/${model}: `
  return (await readLog(path))
    .split('\n')
    .filter((line) => line.includes(prefix))
    .slice(-count)
    .map((line) => line.slice(line.indexOf(prefix) + prefix.length))
    .join('\n')
}
