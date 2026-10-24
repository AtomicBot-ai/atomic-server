import { readFile } from 'node:fs/promises'
export async function workspaceLogs(path: string, count: number) {
  const value = await readFile(path, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return ''
    throw e
  })
  return {
    lines: value
      .split('\n')
      .slice(-count)
      .map((line) =>
        line.replace(/atc_[a-f0-9]{64}/g, '[API key]').replace(/(Bearer\s+)\S+/gi, '$1[redacted]')
      ),
  }
}
