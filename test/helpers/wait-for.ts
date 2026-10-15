/** Poll a condition until it holds, for tests that watch a background transfer. */
export async function waitFor(check: () => Promise<boolean> | boolean, ms = 5000): Promise<void> {
  const until = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > until) throw new Error('condition not reached')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
