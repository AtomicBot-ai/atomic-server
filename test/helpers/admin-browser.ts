/**
 * The built program's web admin in headless Chromium: a server in its own data folder, signed in through the
 * login link `atc admin open --no-open` prints. Nothing reaches the network: the Hub and conf's lists point at
 * a closed loopback port or a fixture file, and the GGUF catalog comes from a seeded cache.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { ATC, ROOT } from './binary.js'

/** A loopback port this process held and let go: nothing listens there, so a request fails at once. */
async function closedPort(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 1}`
}

export interface AdminSession {
  page: Page
  dataFolder: string
  /** `atc --data-folder <this one> …`, with the session's environment. */
  atc(...args: string[]): { code: number | null; out: string; err: string }
  close(): Promise<void>
}

/** `prepare` writes into the data folder before the server starts (a ready setup, a download record). */
export async function adminSession(
  prepare: (dataFolder: string) => void | Promise<unknown> = () => {},
  overrides: NodeJS.ProcessEnv = {}
): Promise<AdminSession> {
  const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-web-'))
  const dataFolder = join(scratch, 'data')
  mkdirSync(join(dataFolder, 'atc', 'cache'), { recursive: true })
  writeFileSync(
    join(dataFolder, 'atc', 'cache', 'workspace-staff-picks.json'),
    JSON.stringify({
      at: Date.now(),
      data: { picks: [{ model_name: 'fixture/web', title: 'Fixture model', format: 'gguf' }] },
    })
  )
  await prepare(dataFolder)
  const CLOSED = await closedPort()
  const env = {
    ...process.env,
    NO_COLOR: '1',
    HF_ENDPOINT: CLOSED,
    ATC_LITERT_LM_MODELS_URL: pathToFileURL(join(ROOT, 'test/fixtures/litert-lm/litert-lm-models.json')).href,
    ATC_FOUNDRY_LOCAL_MODELS_URL: CLOSED,
    ...overrides,
  }
  const atc = (...args: string[]) => {
    const [exe, ...rest] = [...ATC, '--data-folder', dataFolder, ...args]
    const res = spawnSync(exe as string, rest, { encoding: 'utf8', env, timeout: 60_000 })
    return { code: res.status, out: res.stdout, err: res.stderr }
  }
  let browser: Browser | undefined
  const close = async () => {
    await browser?.close()
    atc('stop', '--force', '--kill')
    rmSync(scratch, { recursive: true, force: true })
  }
  try {
    const started = atc('start', '--admin-port', '0', '--json')
    if (started.code !== 0) throw new Error(`atc start: ${started.err}`)
    const login = atc('admin', 'open', '--no-open', '--json')
    if (login.code !== 0) throw new Error(`atc admin open: ${login.err}`)
    browser = await chromium.launch().catch((error: unknown) => {
      throw new Error(
        `Chromium for Playwright is missing: run \`npx playwright install chromium\` (${String(error)})`
      )
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
    // Signed in once the page has traded the link's token for its session cookie.
    const session = page.waitForResponse((res) => res.url().endsWith('/api/session') && res.ok())
    await page.goto((JSON.parse(login.out) as { url: string }).url)
    await session
    return { page, dataFolder, atc, close }
  } catch (error) {
    await close()
    throw error
  }
}
