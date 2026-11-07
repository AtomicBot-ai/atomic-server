import { expect, it } from 'vitest'
import { connectionApiOperation } from './connection-api.js'

it.each([
  [undefined, 'api.start'],
  [{ running: false, host: '127.0.0.1', port: 1339 }, 'api.start'],
  [{ running: true, host: '127.0.0.1', port: 1339 }, 'api.start'],
  [{ running: true, host: '127.0.0.1', port: 1340 }, 'api.restart'],
  [{ running: true, host: '0.0.0.0', port: 1339 }, 'api.restart'],
] as const)('chooses %s → %s for the requested listener', (current, expected) => {
  expect(connectionApiOperation(current, { host: '127.0.0.1', port: 1339 })).toBe(expected)
})
