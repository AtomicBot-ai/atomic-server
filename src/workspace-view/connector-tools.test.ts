import { expect, it } from 'vitest'
import { connectorToolBindings } from './connector-tools.js'
import type { WorkspaceFeatures } from '../contract/index.js'

it('offers only connected enabled selections with stable distinct protocol-safe names', () => {
  const f = {
    connectors: [
      { id: 'one', enabled: true },
      { id: 'two', enabled: true },
      { id: 'off', enabled: false },
    ],
    connector_status: {
      one: { state: 'connected', tools: [{ name: 'read file', inputSchema: {} }] },
      two: { state: 'connected', tools: [{ name: 'read file', inputSchema: {} }] },
      off: { state: 'connected', tools: [{ name: 'danger', inputSchema: {} }] },
    },
  } as unknown as WorkspaceFeatures
  const result = connectorToolBindings(f, ['one', 'two', 'off'])
  expect(result).toHaveLength(2)
  expect(new Set(result.map((t) => t.name)).size).toBe(2)
  expect(result[0]!.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  expect(connectorToolBindings(f, ['two'])[0]).toEqual(result[1])
  expect(connectorToolBindings(f, [])).toEqual([])
})
