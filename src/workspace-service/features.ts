import { documentText, importSkillPackage, exportSkillPackage } from '../document-import/index.js'
import { featurePrompt } from './feature-prompt.js'
import { ConnectorOAuth } from './connector-oauth.js'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../contract/index.js'
import type { WorkspaceFeatures, WorkspaceInput, ConnectorStatus } from '../contract/index.js'
import { readDocument, mutateDocument } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import { object } from './validation.js'
import {
  assistantValue,
  skillValue,
  importSkill,
  connectorValue,
  attachmentValue,
} from './feature-validation.js'
import { prepareAttachment, type EmbedDocuments } from './embedding-retrieval.js'
import { withConnector } from './connector-client.js'
import { NOT_CORE } from './not-core.js'
export class WorkspaceFeatureService {
  private path: string
  private oauth: ConnectorOAuth
  private statuses: Record<string, ConnectorStatus> = {}
  constructor(
    atcDir: string,
    private request: typeof fetch = fetch,
    private env: NodeJS.ProcessEnv = {},
    private embed?: EmbedDocuments
  ) {
    this.path = join(atcDir, 'workspace-features.json')
    this.oauth = new ConnectorOAuth(atcDir, request)
  }
  private empty(): WorkspaceFeatures {
    return {
      assistants: [structuredClone(DEFAULT_ASSISTANT)],
      default_assistant: DEFAULT_ASSISTANT.id,
      skills: [],
      connectors: [],
      connector_status: {},
      attachments: { ...DEFAULT_ATTACHMENTS },
    }
  }
  private read() {
    return readDocument(this.path, this.empty())
  }
  async view(): Promise<WorkspaceFeatures> {
    const value = await this.read()
    return {
      ...value,
      attachments: { ...DEFAULT_ATTACHMENTS, ...value.attachments },
      connector_status: structuredClone(this.statuses),
      skills: value.skills.map(({ resources, ...skill }) => ({
        ...skill,
        resource_names: Object.keys(resources ?? {}),
      })),
      connectors: value.connectors.map((c) => ({
        ...c,
        env: Object.fromEntries(Object.keys(c.env).map((k) => [k, '••••••••'])),
        headers: Object.fromEntries(Object.keys(c.headers).map((k) => [k, '••••••••'])),
      })),
    }
  }
  async execute(operation: string, input: WorkspaceInput) {
    if (operation === 'features.get') return this.view()
    if (operation === 'connectors.import') {
      const servers = object(object(input['value'])['mcpServers']),
        revoke: string[] = []
      await mutateDocument(this.path, this.empty(), (current) => {
        const next = Object.entries(servers).map(([id, value]) =>
          connectorValue(
            { ...object(value), name: object(value)['name'] ?? id },
            id,
            current.connectors.find((c) => c.id === id)
          )
        )
        for (const old of current.connectors) {
          const replacement = next.find((item) => item.id === old.id)
          if (!replacement || old.url !== replacement.url || old.type !== replacement.type)
            revoke.push(old.id)
        }
        current.connectors = next
        return current
      })
      for (const id of revoke) await this.oauth.logout(id)
      this.statuses = {}
      return this.view()
    }
    if (operation.startsWith('connectors.oauth.')) {
      const id = String(input['id']),
        item = (await this.read()).connectors.find((c) => c.id === id)
      if (!item || item.type === 'stdio') throw new AtcError('ATC_USAGE', 'Choose an HTTP connector.')
      if (operation === 'connectors.oauth.start')
        return this.oauth.start(id, item.url, input['client_id'] as string | undefined)
      if (operation === 'connectors.oauth.cancel') return this.oauth.cancel(id)
      if (operation === 'connectors.oauth.logout') return this.oauth.logout(id)
      return this.oauth.status(id)
    }
    if (operation === 'attachments.parse') {
      const current = await this.read()
      if (!current.attachments.enabled) throw new Error('Enable document attachments in Settings first.')
      return {
        name: String(input['name']),
        content: await documentText(
          String(input['name']),
          Buffer.from(String(input['data']), 'base64'),
          current.attachments.max_file_size_mb
        ),
      }
    }
    if (operation === 'attachments.prepare') {
      const current = await this.read()
      return prepareAttachment(
        { ...DEFAULT_ATTACHMENTS, ...current.attachments },
        String(input['name']),
        String(input['content']),
        String(input['query'] ?? ''),
        this.embed
      )
    }
    if (operation === 'skills.export') {
      const skill = (await this.read()).skills.find((s) => s.name === input['id'])
      if (!skill) throw new AtcError('ATC_USAGE', 'This skill no longer exists.')
      const content = `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.body}`
      return { name: `${skill.name}.skill`, content, data: exportSkillPackage(content, skill.resources) }
    }
    if (operation === 'connectors.check' || operation === 'connectors.call')
      return this.connect(operation, input)
    if (
      !/^(assistants\.(save|remove|default)|skills\.(save|remove|toggle|import)|connectors\.(save|remove)|attachments\.update)$/.test(
        operation
      )
    )
      return NOT_CORE
    const revoke: string[] = []
    await mutateDocument(this.path, this.empty(), (current) => {
      const value = object(input['value']),
        id = String(value['id'] || input['id'] || randomUUID())
      switch (operation) {
        case 'assistants.save': {
          const next = assistantValue(value, id)
          current.assistants = [...current.assistants.filter((a) => a.id !== id), next]
          break
        }
        case 'assistants.remove': {
          if (id === DEFAULT_ASSISTANT.id)
            throw new AtcError('ATC_USAGE', 'The built-in assistant cannot be removed.')
          current.assistants = current.assistants.filter((a) => a.id !== id)
          if (current.default_assistant === id) current.default_assistant = DEFAULT_ASSISTANT.id
          break
        }
        case 'assistants.default':
          if (!current.assistants.some((a) => a.id === id))
            throw new AtcError('ATC_USAGE', 'Choose an existing assistant.')
          current.default_assistant = id
          break
        case 'skills.save':
        case 'skills.import': {
          const archive =
            operation === 'skills.import' && input['data']
              ? importSkillPackage(Buffer.from(String(input['data']), 'base64'))
              : undefined
          const next =
            operation === 'skills.import'
              ? importSkill(archive?.content ?? String(input['content']))
              : skillValue(value)
          next.resources =
            archive?.resources ??
            current.skills.find((s) => s.name === (value['id'] ?? next.name))?.resources ??
            {}
          current.skills = [
            ...current.skills.filter((s) => s.name !== next.name && s.name !== value['id']),
            next,
          ]
          break
        }
        case 'skills.remove':
          current.skills = current.skills.filter((s) => s.name !== id)
          break
        case 'skills.toggle':
          current.skills = current.skills.map((s) =>
            s.name === id ? { ...s, enabled: input['enabled'] === true } : s
          )
          break
        case 'connectors.save': {
          const next = connectorValue(
            value,
            id,
            current.connectors.find((c) => c.id === id)
          )
          const old = current.connectors.find((c) => c.id === id)
          if (old && (old.url !== next.url || old.type !== next.type)) revoke.push(id)
          current.connectors = [...current.connectors.filter((c) => c.id !== id), next]
          delete this.statuses[id]
          break
        }
        case 'connectors.remove':
          revoke.push(id)
          current.connectors = current.connectors.filter((c) => c.id !== id)
          delete this.statuses[id]
          break
        case 'attachments.update':
          current.attachments = attachmentValue(value, { ...DEFAULT_ATTACHMENTS, ...current.attachments })
      }
      return current
    })
    for (const id of revoke) await this.oauth.logout(id)
    return this.view()
  }
  private async connect(operation: string, input: WorkspaceInput) {
    const id = String(input['id']),
      connector = (await this.read()).connectors.find((c) => c.id === id)
    if (!connector) throw new AtcError('ATC_USAGE', 'This connector no longer exists.')
    this.statuses[id] = { state: 'checking', tools: this.statuses[id]?.tools ?? [] }
    try {
      const authorization =
        connector.type !== 'stdio' ? await this.oauth.header(id, connector.url) : undefined
      const configured = authorization
        ? { ...connector, headers: { ...connector.headers, Authorization: authorization } }
        : connector
      return await withConnector(configured, this.request, this.env, async (client, tools) => {
        this.statuses[id] = { state: 'connected', tools, checked_at: Date.now() }
        if (operation === 'connectors.check') return this.statuses[id]
        if (!tools.some((t) => t.name === input['tool']))
          throw new AtcError('ATC_USAGE', 'Choose an available connector tool.')
        return client.send('tools/call', { name: input['tool'], arguments: object(input['arguments']) })
      })
    } catch (error) {
      this.statuses[id] = {
        state: 'error',
        tools: [],
        error: error instanceof Error ? error.message : String(error),
        checked_at: Date.now(),
      }
      throw error
    }
  }
  async enrich(body: Record<string, unknown>) {
    return featurePrompt(await this.read(), body)
  }
}
