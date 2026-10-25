/**
 * The shared `workspace-features.json`: assistants, skills, connectors and attachment settings, read and
 * changed under the cross-process lock and validated on the way in. It says which connectors a change
 * makes lose their sign-in (`revoke`) or their status (`forget`); the connector runtime acts on that.
 */
import { randomUUID } from 'node:crypto'
import { importSkillPackage, exportSkillPackage } from '../../document-import/index.js'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../../contract/index.js'
import type { WorkspaceFeatures, WorkspaceInput, ConnectorStatus } from '../../contract/index.js'
import { readDocument, mutateDocument } from '../../terminal-data/index.js'
import { AtcError } from '../../errors/index.js'
import { object } from '../validation.js'
import {
  assistantValue,
  skillValue,
  importSkill,
  connectorValue,
  attachmentValue,
} from './feature-validation.js'
import { featurePrompt } from './feature-prompt.js'

export interface FeatureChange {
  revoke: string[]
  forget: string[]
}

export class FeatureDocument {
  constructor(private readonly path: string) {}
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
  read() {
    return readDocument(this.path, this.empty())
  }
  async view(statuses: Record<string, ConnectorStatus>): Promise<WorkspaceFeatures> {
    const value = await this.read()
    return {
      ...value,
      attachments: { ...DEFAULT_ATTACHMENTS, ...value.attachments },
      connector_status: statuses,
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
  async connector(id: string) {
    return (await this.read()).connectors.find((c) => c.id === id)
  }
  async attachments() {
    return { ...DEFAULT_ATTACHMENTS, ...(await this.read()).attachments }
  }
  async enrich(body: Record<string, unknown>) {
    return featurePrompt(await this.read(), body)
  }
  async exportSkill(id: unknown) {
    const skill = (await this.read()).skills.find((s) => s.name === id)
    if (!skill) throw new AtcError('ATC_USAGE', 'This skill no longer exists.')
    const content = `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.body}`
    return { name: `${skill.name}.skill`, content, data: exportSkillPackage(content, skill.resources) }
  }
  /** Replace every connector with an MCP client's `mcpServers` JSON. */
  async importConnectors(input: WorkspaceInput): Promise<FeatureChange> {
    const raw = object(input['value'])['mcpServers']
    // The import replaces every connector: a document in another shape must not read as "none".
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new AtcError('ATC_USAGE', 'Paste JSON with an mcpServers object, as MCP clients write it.')
    const servers = object(raw),
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
        if (!replacement || old.url !== replacement.url || old.type !== replacement.type) revoke.push(old.id)
      }
      current.connectors = next
      return current
    })
    return { revoke, forget: [] }
  }
  /** Save, remove or toggle an assistant, skill or connector, or update the attachment settings. */
  async change(operation: string, input: WorkspaceInput): Promise<FeatureChange> {
    const revoke: string[] = [],
      forget: string[] = []
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
          forget.push(id)
          break
        }
        case 'connectors.remove':
          revoke.push(id)
          current.connectors = current.connectors.filter((c) => c.id !== id)
          forget.push(id)
          break
        case 'attachments.update':
          current.attachments = attachmentValue(value, { ...DEFAULT_ATTACHMENTS, ...current.attachments })
      }
      return current
    })
    return { revoke, forget }
  }
}
