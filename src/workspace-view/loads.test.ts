import { describe, expect, it } from 'vitest'
import { LOAD_STAGE_LABELS, loadStageText } from './loads.js'

describe('load stages', () => {
  it('labels every stage the core reports', () => {
    expect(Object.keys(LOAD_STAGE_LABELS).sort()).toEqual(
      ['initializing-engine', 'ready', 'starting-container', 'stopping-previous'].sort()
    )
  })

  it.each([
    [{ stage: 'starting-container', elapsed_ms: 2100 }, 'Starting the container (2s)'],
    [{ stage: 'initializing-engine', elapsed_ms: 41_000 }, 'Initializing the engine (41s)'],
    [{ stage: 'initializing-engine', elapsed_ms: 125_000 }, 'Initializing the engine (2m 5s)'],
    [{ stage: 'something-new', elapsed_ms: 0 }, 'something-new (0s)'],
  ] as const)('%j', (load, text) => expect(loadStageText(load)).toBe(text))
})
