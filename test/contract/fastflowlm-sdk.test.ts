import { expect, it } from 'vitest'
import { CORE_VERSION } from '@atomic-chat/core'
import * as sdk from '@atomic-chat/core/client'
import baseline from '../../src/workspace-service/models/model-catalog-baseline.json' with { type: 'json' }

it('embeds the FastFlowLM SDK and accepts a legacy catalog without an FLM collection', () => {
  expect(CORE_VERSION).toBe('0.22.0')
  expect(sdk.projectFastFlowLmCollection(sdk.parseAtomicModelCatalog(baseline))).toEqual({
    schema_version: 1,
    models: [],
  })
  expect(sdk.buildFastFlowLmConfig).toBeTypeOf('function')
  expect(sdk.fastFlowLmHostRequest).toBeTypeOf('function')
})
