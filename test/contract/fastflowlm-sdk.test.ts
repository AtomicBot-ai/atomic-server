import { expect, it } from 'vitest'
import { CORE_VERSION } from '@atomic-chat/core'
import * as sdk from '@atomic-chat/core/client'
import serverPackage from '../../package.json' with { type: 'json' }
import baseline from '../../src/workspace-service/models/model-catalog-baseline.json' with { type: 'json' }

it('embeds the FastFlowLM SDK and accepts a legacy catalog without an FLM collection', () => {
  expect(CORE_VERSION).toBe(serverPackage.dependencies['@atomic-chat/core'])
  const legacy = structuredClone(baseline)
  Reflect.deleteProperty(legacy.collections, 'fastflowlm-models')
  expect(sdk.projectFastFlowLmCollection(sdk.parseAtomicModelCatalog(legacy))).toEqual({
    schema_version: 1,
    models: [],
  })
  expect(sdk.buildFastFlowLmConfig).toBeTypeOf('function')
  expect(sdk.fastFlowLmHostRequest).toBeTypeOf('function')
})
