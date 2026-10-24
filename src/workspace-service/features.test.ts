import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceFeatureService } from './features.js'
import { prepareDocument } from './attachment-processing.js'
import { DEFAULT_ATTACHMENTS } from '../contract/index.js'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atc-features-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})
it('shares assistant CRUD and default across clients and applies instructions without leaking request metadata', async () => {
  const a = new WorkspaceFeatureService(dir),
    b = new WorkspaceFeatureService(dir)
  await a.execute('assistants.save', {
    value: {
      id: 'reviewer',
      name: 'Reviewer',
      instructions: 'Review carefully. {{current_date}}',
      parameters: { temperature: 0.2 },
    },
  })
  await a.execute('assistants.default', { id: 'reviewer' })
  expect((await b.view()).default_assistant).toBe('reviewer')
  const body = await b.enrich({
    model: 'test',
    messages: [{ role: 'user', content: 'Review this' }],
    atomic_assistant: 'reviewer',
    atomic_skills: [],
    atomic_connectors: [],
  })
  expect(body).toMatchObject({
    temperature: 0.2,
    messages: [
      { role: 'system', content: expect.stringMatching(/^Review carefully\. \d{4}-\d{2}-\d{2}$/) },
      { role: 'user', content: 'Review this' },
    ],
  })
  expect(body).not.toHaveProperty('atomic_assistant')
  expect(body).not.toHaveProperty('atomic_connectors')
  await b.execute('assistants.remove', { id: 'reviewer' })
  expect((await a.view()).default_assistant).toBe('atomic-chat')
})
it('imports, edits, disables and exports real skill instructions and only injects selected enabled skills', async () => {
  const service = new WorkspaceFeatureService(dir)
  await service.execute('skills.import', {
    content: '---\nname: code-review\ndescription: Review code\n---\nExplain risks.',
  })
  const exported = await service.execute('skills.export', { id: 'code-review' })
  expect(exported).toMatchObject({ content: expect.stringContaining('Explain risks.') })
  expect(
    await service.enrich({ messages: [], atomic_assistant: 'none', atomic_skills: ['code-review'] })
  ).toMatchObject({ messages: [{ role: 'system', content: 'Skill: code-review\nExplain risks.' }] })
  await service.execute('skills.toggle', { id: 'code-review', enabled: false })
  expect(
    await service.enrich({ messages: [], atomic_assistant: 'none', atomic_skills: ['code-review'] })
  ).toMatchObject({ messages: [] })
  await expect(service.execute('skills.save', { value: { name: '../../bad', body: 'bad' } })).rejects.toThrow(
    'lowercase'
  )
})
it('performs a real MCP HTTP handshake, enumerates tools and only calls a selected tool explicitly', async () => {
  const calls: string[] = []
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    calls.push(body.method)
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    const result =
      body.method === 'initialize'
        ? { protocolVersion: '2025-03-26' }
        : body.method === 'tools/list'
          ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
          : { content: [{ type: 'text', text: body.params.arguments.text }] }
    return Response.json(
      { jsonrpc: '2.0', id: body.id, result },
      { headers: { 'mcp-session-id': 'test-session' } }
    )
  })
  const service = new WorkspaceFeatureService(dir, request)
  await service.execute('connectors.save', {
    value: {
      id: 'echo',
      name: 'Echo',
      url: 'http://127.0.0.1:1234/mcp',
      headers: { Authorization: 'Bearer private' },
    },
  })
  expect(request).not.toHaveBeenCalled()
  expect((await service.view()).connectors[0]?.headers).toEqual({ Authorization: '••••••••' })
  await service.execute('connectors.check', { id: 'echo' })
  expect(calls).toEqual(['initialize', 'notifications/initialized', 'tools/list'])
  expect((await service.view()).connector_status['echo']).toMatchObject({
    state: 'connected',
    tools: [{ name: 'echo' }],
  })
  expect(
    await service.execute('connectors.call', { id: 'echo', tool: 'echo', arguments: { text: 'hello' } })
  ).toMatchObject({ content: [{ text: 'hello' }] })
  await expect(
    service.execute('connectors.call', { id: 'echo', tool: 'missing', arguments: {} })
  ).rejects.toThrow('available')
})
it('keeps failed connection visible and does not expose credentials in shared views', async () => {
  const service = new WorkspaceFeatureService(
    dir,
    vi.fn(async () => new Response(null, { status: 401 }))
  )
  await service.execute('connectors.save', {
    value: {
      id: 'a',
      name: 'Private',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'secret' },
    },
  })
  await expect(service.execute('connectors.check', { id: 'a' })).rejects.toThrow('authentication')
  expect((await service.view()).connector_status['a']?.state).toBe('error')
  expect(JSON.stringify(await service.view())).not.toContain('"secret"')
})
it('applies attachment configuration, bounds and deterministic relevant excerpts', async () => {
  const service = new WorkspaceFeatureService(dir)
  await expect(
    service.execute('attachments.update', { value: { chunk_size_chars: 200, overlap_chars: 300 } })
  ).rejects.toThrow('smaller')
  await service.execute('attachments.update', { value: { enabled: false } })
  await expect(service.execute('attachments.prepare', { name: 'a.txt', content: 'hi' })).rejects.toThrow(
    'Enable'
  )
  const selected = prepareDocument(
    {
      ...DEFAULT_ATTACHMENTS,
      parse_mode: 'retrieval',
      chunk_size_chars: 200,
      overlap_chars: 0,
      retrieval_limit: 1,
    },
    'notes.md',
    'unrelated '.repeat(50) + 'violet target '.repeat(15),
    'violet'
  )
  expect(selected.content).toContain('violet')
  expect(selected.chunks).toBe(1)
})
it('imports portable skill resources and exposes names without including file data in snapshots', async () => {
  const { exportSkillPackage } = await import('../document-import/index.js')
  const service = new WorkspaceFeatureService(dir)
  const data = exportSkillPackage('---\nname: packaged\ndescription: Review\n---\nInstructions', {
    'scripts/tool.py': Buffer.from('print("not executed")').toString('base64'),
  })
  await service.execute('skills.import', { data })
  expect((await service.view()).skills[0]).toMatchObject({
    name: 'packaged',
    resource_names: ['scripts/tool.py'],
  })
  expect((await service.view()).skills[0]).not.toHaveProperty('resources')
  await service.execute('skills.save', {
    value: { name: 'packaged', description: 'Edited', body: 'Updated instructions' },
  })
  expect(await service.execute('skills.export', { id: 'packaged' })).toMatchObject({
    name: 'packaged.skill',
    data: expect.any(String),
    content: expect.stringContaining('Updated instructions'),
  })
})
it('revokes stored OAuth credentials when connectors are removed, replaced or change their resource', async () => {
  const { ConnectorOAuth } = await import('./connector-oauth.js')
  const logout = vi.spyOn(ConnectorOAuth.prototype, 'logout').mockResolvedValue({ signed_out: true })
  try {
    const service = new WorkspaceFeatureService(dir)
    await service.execute('connectors.save', { value: { id: 'a', name: 'A', url: 'https://a.test/mcp' } })
    await service.execute('connectors.save', { value: { id: 'a', name: 'A', url: 'https://b.test/mcp' } })
    expect(logout).toHaveBeenCalledWith('a')
    logout.mockClear()
    await service.execute('connectors.import', { value: { mcpServers: {} } })
    expect(logout).toHaveBeenCalledWith('a')
    await service.execute('connectors.save', { value: { id: 'b', name: 'B', url: 'https://b.test/mcp' } })
    await service.execute('connectors.remove', { id: 'b' })
    expect(logout).toHaveBeenCalledWith('b')
  } finally {
    logout.mockRestore()
  }
})
