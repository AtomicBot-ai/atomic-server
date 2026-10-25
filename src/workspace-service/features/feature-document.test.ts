import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FeatureDocument } from './feature-document.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function doc() {
  const dir = mkdtempSync(join(tmpdir(), 'atc-feature-doc-'))
  dirs.push(dir)
  return new FeatureDocument(join(dir, 'workspace-features.json'))
}
const http = (id: string, url: string) => ({
  value: { id, name: id, url, headers: { Authorization: 'secret' } },
})

describe('the features document', () => {
  it('shows connector secrets masked, skill resources by name, and the statuses it is given', async () => {
    const d = doc()
    await d.change('connectors.save', http('a', 'https://a.test/mcp'))
    const view = await d.view({ a: { state: 'connected', tools: [] } })
    expect(view.connectors[0]?.headers).toEqual({ Authorization: '••••••••' })
    expect(view.connector_status).toEqual({ a: { state: 'connected', tools: [] } })
    expect(view.attachments.enabled).toBe(true)
  })

  it('says which connectors lose their sign-in and their status when one is saved or removed', async () => {
    const d = doc()
    expect(await d.change('connectors.save', http('a', 'https://a.test/mcp'))).toEqual({
      revoke: [],
      forget: ['a'],
    })
    expect(await d.change('connectors.save', http('a', 'https://a.test/mcp'))).toEqual({
      revoke: [],
      forget: ['a'],
    })
    expect(await d.change('connectors.save', http('a', 'https://b.test/mcp'))).toEqual({
      revoke: ['a'],
      forget: ['a'],
    })
    expect(await d.change('connectors.remove', { id: 'a' })).toEqual({ revoke: ['a'], forget: ['a'] })
    expect(await d.change('assistants.save', { value: { id: 'r', name: 'R', instructions: 'x' } })).toEqual({
      revoke: [],
      forget: [],
    })
  })

  it('replaces every connector on import and revokes the ones that changed or went', async () => {
    const d = doc()
    await d.change('connectors.save', http('keep', 'https://keep.test/mcp'))
    await d.change('connectors.save', http('gone', 'https://gone.test/mcp'))
    const { revoke } = await d.importConnectors({
      value: { mcpServers: { keep: { url: 'https://keep.test/mcp' }, files: { command: 'npx' } } },
    })
    expect(revoke).toEqual(['gone'])
    expect((await d.read()).connectors.map((c) => c.id)).toEqual(['keep', 'files'])
    await expect(d.importConnectors({ value: { servers: {} } })).rejects.toMatchObject({ code: 'ATC_USAGE' })
  })

  it('finds a connector by id, and merges attachment settings with their defaults', async () => {
    const d = doc()
    await d.change('connectors.save', http('a', 'https://a.test/mcp'))
    expect((await d.connector('a'))?.url).toBe('https://a.test/mcp')
    expect(await d.connector('nope')).toBeUndefined()
    await d.change('attachments.update', { value: { max_file_size_mb: 5 } })
    expect(await d.attachments()).toMatchObject({ enabled: true, max_file_size_mb: 5 })
  })

  it('exports a skill as a package and refuses one that is gone', async () => {
    const d = doc()
    await d.change('skills.import', { content: '---\nname: review\ndescription: Review\n---\nBe careful.' })
    expect(await d.exportSkill('review')).toMatchObject({
      name: 'review.skill',
      content: expect.stringContaining('Be careful.'),
    })
    await expect(d.exportSkill('nope')).rejects.toThrow('This skill no longer exists.')
  })
})
