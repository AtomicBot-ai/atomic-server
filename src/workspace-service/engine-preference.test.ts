import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { EngineSelection } from '../terminal-setup/index.js'
import { enginePreferenceOperation } from './engine-preference.js'
import { NOT_CORE } from './not-core.js'

it('shares engine selection between a web operation and an independently opened terminal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-shared-engine-')),
    link = fakeCoreLink()
  link.responses['POST /engines/versions'] = {
    engines: [{ engine: 'llamacpp', active: { version: 'b2', variant: 'metal' } }],
  }
  try {
    expect(await enginePreferenceOperation(link, directory, 'engines.selected', {})).toEqual({
      id: '',
      engine: '',
    })
    await enginePreferenceOperation(link, directory, 'engines.select', { engine: 'llamacpp' })
    expect(await new EngineSelection(directory, async () => link).read()).toBe('llamacpp|b2|metal')
    await new EngineSelection(directory, async () => link).remember('llamacpp-upstream|b3|cpu')
    expect(await enginePreferenceOperation(link, directory, 'engines.selected', {})).toEqual({
      id: 'llamacpp-upstream|b3|cpu',
      engine: 'llamacpp-upstream',
    })
    expect(link.calls.filter((call) => !call.path.endsWith('/versions'))).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses unavailable engines without overwriting the current selection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-shared-engine-invalid-')),
    link = fakeCoreLink(),
    preference = new EngineSelection(directory, async () => link)
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'llamacpp', active: null }] }
  try {
    await preference.remember('llamacpp-upstream|b1|cpu')
    await expect(
      enginePreferenceOperation(link, directory, 'engines.select', { engine: 'llamacpp' })
    ).rejects.toThrow('Install this engine')
    await expect(
      enginePreferenceOperation(link, directory, 'engines.select', { engine: '../unknown' })
    ).rejects.toThrow('Install this engine')
    expect(await preference.read()).toBe('llamacpp-upstream|b1|cpu')
    expect(await enginePreferenceOperation(link, directory, 'unrelated', {})).toBe(NOT_CORE)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
