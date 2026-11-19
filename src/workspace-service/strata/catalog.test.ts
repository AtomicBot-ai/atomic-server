import { expect, it, vi } from 'vitest'
import fixture from '../../../test/fixtures/strata/catalog.json' with { type: 'json' }
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { catalogFixture } from '../../../test/helpers/model-catalog-fixture.js'
import { defaultConfig } from '../../config/index.js'
import { strataCatalog } from './catalog.js'
import { strataPlan } from './plan.js'

it('groups published quants for the core backend and keeps exact variant IDs for plans', async () => {
  const { paths, cleanup } = tmpDataFolder()
  const document = catalogFixture()
  const strata = structuredClone(fixture)
  const collection = strata.collections['strata-models']
  const example = collection.entries[0]!
  const entry = structuredClone(strata.models[example.model as keyof typeof strata.models])
  const definition = entry.definition
  const original = definition.variant_id
  const alternate = 'iq2-xs-dflash2'
  const cuda = 'windows-x64-cuda13'
  const metal = 'macos-arm64-metal'
  const extra = {
    ...entry,
    variants: { [alternate]: { family: definition.family } },
    definition: {
      ...definition,
      variant_id: alternate,
      name: 'Qwen3.8-Flash-Next IQ2_XS',
      compatible_variants: [cuda],
    },
  }
  const key = 'fixture:strata:alternate'
  Object.assign(document.models, strata.models, { [key]: extra })
  Object.assign(document.collections, strata.collections)
  document.collections['strata-models']!.entries!.push({ ...example, model: key, variant: alternate })
  const link = fakeCoreLink()
  link.responses['POST /models/strata/check'] = { verdict: 'ok' }
  const options = {
    paths,
    link,
    config: defaultConfig(),
    fetch: vi.fn<typeof fetch>(async () => Response.json(document)),
  }
  try {
    link.responses['POST /engine-builds/strata/catalog'] = { host_backend_id: metal }
    expect((await strataCatalog(options, '', false)).models).toMatchObject([
      { recommended: true, variants: [{ id: original, label: 'IQ3_XXS' }] },
    ])
    link.responses['POST /engine-builds/strata/catalog'] = {
      active: { backend_id: cuda },
      host_backend_id: metal,
    }
    expect((await strataCatalog(options, alternate, false)).models).toMatchObject([
      {
        recommended: false,
        model_id: original,
        variants: [{ id: original }, { id: alternate, label: 'IQ2_XS' }],
      },
    ])
    expect((await strataPlan(options, 'strata/' + alternate)).variant_id).toBe(alternate)
    link.responses['POST /engine-builds/strata/catalog'] = { host_backend_id: null }
    expect((await strataCatalog(options, '', false)).models).toEqual([])
  } finally {
    cleanup()
  }
})
