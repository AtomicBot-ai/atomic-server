import { describe, expect, it } from 'vitest'
import { proxyAllowed } from './bff.js'

describe('proxyAllowed', () => {
  it.each([
    ['GET', '/snapshot', true],
    ['GET', '/sessions', true],
    ['GET', '/backends/llamacpp-upstream', true],
    ['GET', '/clients', false],
    ['GET', '/cloud/providers', false],
    ['POST', '/models/llamacpp-upstream/x/load', true],
    ['POST', '/server/start', true],
    ['POST', '/shutdown', false],
    ['PUT', '/telemetry', false],
    ['PUT', '/hardware/override', true],
    ['DELETE', '/clients/1', false],
    ['POST', '/environments/default/operations', true],
    // Exact routes: a longer or shorter path under an allowed one is not allowed.
    ['POST', '/server/startX', false],
    ['POST', '/server/start/x', false],
    ['POST', '/environmentsX', false],
    ['POST', '/disk/availableX', false],
    ['POST', '/models/llamacpp-upstream/org/repo/model.gguf/load', true],
    ['POST', '/models/llamacpp-upstream/x/load/cancel', true],
    ['POST', '/models/llamacpp-upstream/load', false],
    ['POST', '/models/llamacpp-upstream/x/recreate', false],
    ['POST', '/downloads/llamacpp-backend-b1/macos-arm64/cancel', true],
    ['DELETE', '/backends/llamacpp/b1/macos-arm64', true],
    ['DELETE', '/backends/llamacpp', false],
    ['PATCH', '/settings/llamacpp', true],
    ['POST', '/settings/llamacpp/import', false],
    ['POST', '/settings/llamacpp/acknowledge', false],
    ['POST', '/environments/operations/op1/host-step-result', false],
    ['POST', '/environments/operations/op1/resume', true],
    // Model setups are atc's own workspace operations; the core has no such routes any more.
    ['POST', '/models/setup-plan', false],
    ['POST', '/model-setups', false],
    ['GET', '/model-setups', false],
    ['POST', '/models/compatibility', true],
  ])('%s %s → %s', (method, path, expected) => {
    expect(proxyAllowed(method, path)).toBe(expected)
  })
})
