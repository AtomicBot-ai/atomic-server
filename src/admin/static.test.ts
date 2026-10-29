import { expect, it } from 'vitest'
import { serveStatic } from './static.js'

it('refuses to be framed', () => {
  const page = serveStatic('/')
  expect(page?.headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(page?.headers['content-security-policy']).toContain("default-src 'self'")
  expect(page?.headers['x-frame-options']).toBe('DENY')
})
