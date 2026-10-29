import { expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import type { ModelSetupEngine } from '../../contract/index.js'
import { setupEngineInstaller } from './setup-engines.js'
it('shares one engine install and releases it for the next attempt', async () => {
  const link = fakeCoreLink(),
    request = vi.spyOn(link, 'request')
  const install = setupEngineInstaller({ link })
  const engine = { version: 'build', backend: 'cpu' } as ModelSetupEngine
  const first = install(engine, 'first')
  expect(install(engine, 'second')).toBe(first)
  await first
  await install(engine, 'third')
  expect(request).toHaveBeenCalledTimes(2)
})
