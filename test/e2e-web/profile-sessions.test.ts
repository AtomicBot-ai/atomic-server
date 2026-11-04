import { expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'

it('keeps two local profiles signed in in the same browser and logs out only one', async () => {
  const first = await adminSession()
  let second: Awaited<ReturnType<typeof adminSession>> | undefined
  try {
    second = await adminSession()
    const context = await first.page.context().browser()!.newContext()
    const firstPage = await context.newPage()
    const firstLogin = first.atc('admin', 'open', '--no-open', '--json')
    expect(firstLogin.code).toBe(0)
    const firstSignedIn = firstPage.waitForResponse((r) => r.url().endsWith('/api/session') && r.ok())
    await firstPage.goto((JSON.parse(firstLogin.out) as { url: string }).url)
    await firstSignedIn
    const page = await context.newPage()
    const login = second.atc('admin', 'open', '--no-open', '--json')
    expect(login.code).toBe(0)
    const signedIn = page.waitForResponse((r) => r.url().endsWith('/api/session') && r.ok())
    await page.goto((JSON.parse(login.out) as { url: string }).url)
    await signedIn
    const status = async (url: string) =>
      (await context.request.get(new URL('/api/status', url).href)).status()
    expect(await status(first.page.url())).toBe(200)
    expect(await status(page.url())).toBe(200)
    const cookies = await context.cookies()
    expect(cookies.filter((c) => c.name.startsWith('atc_session_'))).toHaveLength(2)
    expect(
      cookies
        .filter((c) => c.name.startsWith('atc_session_'))
        .every((c) => c.httpOnly && c.sameSite === 'Strict')
    ).toBe(true)
    const logout = await context.request.delete(new URL('/api/session', page.url()).href, {
      headers: { 'x-atc-admin': '1' },
    })
    expect(logout.status()).toBe(204)
    expect(await status(page.url())).toBe(401)
    expect(await status(first.page.url())).toBe(200)
    await firstPage.reload()
    expect(await status(first.page.url())).toBe(200)
  } finally {
    await second?.close()
    await first.close()
  }
}, 60000)
