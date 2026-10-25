/**
 * The workspace's assistants, skills, connectors and attachments, for every client: routes their
 * operations to the shared document (`FeatureDocument`), the running connectors (`ConnectorRuntime`) and
 * attachment processing; `NOT_CORE` for any other operation.
 */
import { join } from 'node:path'
import type { WorkspaceFeatures, WorkspaceInput } from '../../contract/index.js'
import { ConnectorRuntime } from '../connectors/connector-runtime.js'
import { NOT_CORE } from '../not-core.js'
import { FeatureDocument, type FeatureChange } from './feature-document.js'
import { parseAttachment, prepareAttachmentInput } from './feature-attachments.js'
import type { EmbedDocuments } from './embedding-retrieval.js'

const DOCUMENT_CHANGES =
  /^(assistants\.(save|remove|default)|skills\.(save|remove|toggle|import)|connectors\.(save|remove)|attachments\.update)$/

export class WorkspaceFeatureService {
  private readonly document: FeatureDocument
  private readonly connectors: ConnectorRuntime
  constructor(
    atcDir: string,
    request: typeof fetch = fetch,
    env: NodeJS.ProcessEnv = {},
    private readonly embed?: EmbedDocuments
  ) {
    this.document = new FeatureDocument(join(atcDir, 'workspace-features.json'))
    this.connectors = new ConnectorRuntime(atcDir, request, env)
  }
  view(): Promise<WorkspaceFeatures> {
    return this.document.view(this.connectors.statuses())
  }
  enrich(body: Record<string, unknown>) {
    return this.document.enrich(body)
  }
  async execute(operation: string, input: WorkspaceInput) {
    if (operation === 'features.get') return this.view()
    if (operation === 'connectors.import') {
      await this.apply(await this.document.importConnectors(input))
      this.connectors.reset()
      return this.view()
    }
    if (operation.startsWith('connectors.oauth.'))
      return this.connectors.signIn(operation, await this.document.connector(String(input['id'])), input)
    if (operation === 'attachments.parse')
      return parseAttachment((await this.document.read()).attachments, input)
    if (operation === 'attachments.prepare')
      return prepareAttachmentInput(await this.document.attachments(), input, this.embed)
    if (operation === 'skills.export') return this.document.exportSkill(input['id'])
    if (operation === 'connectors.check' || operation === 'connectors.call')
      return this.connectors.connect(operation, await this.document.connector(String(input['id'])), input)
    if (!DOCUMENT_CHANGES.test(operation)) return NOT_CORE
    await this.apply(await this.document.change(operation, input))
    return this.view()
  }
  private async apply({ revoke, forget }: FeatureChange) {
    this.connectors.forget(forget)
    await this.connectors.revoke(revoke)
  }
}
