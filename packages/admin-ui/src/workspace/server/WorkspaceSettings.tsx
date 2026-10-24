import { FeatureMenu } from './FeatureMenu'
import { fileData, downloadData } from '../file-data'
// Lifted from atomic-chat-ui routes/settings/assistant.tsx, connectors/index.tsx and skills/index.tsx @ 807b4d9; adapted: shared server-owned features.
import { useState } from 'react'
import { Bot, FileText, Plus, Pencil, Trash2, Download } from 'lucide-react'
import { DEFAULT_ASSISTANT } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { ActionConfirmation } from '../ActionConfirmation'
import { FeatureEditor } from './FeatureEditor'
import { ConnectorsSettings } from './ConnectorsSettings'
import { AttachmentSettings } from './AttachmentSettings'
import { DetailPicker } from './DetailPicker'
import './workspace-features.css'
type Value = Record<string, unknown>
export function WorkspaceSettings({ section, workspace: w }: { section: string; workspace: Workspace }) {
  const [editor, setEditor] = useState<Value | null>(null),
    [remove, setRemove] = useState<{ id: string; name: string } | null>(null)
  const [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [, setBusy] = useState('')
  if (section === 'attachments') return <AttachmentSettings workspace={w} />
  if (section === 'connectors') return <ConnectorsSettings workspace={w} />
  const kind = section as 'assistants' | 'connectors' | 'skills',
    data = w.snapshot?.features
  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const exportSkill = async (id: string) => {
    const value = await w.execute<{ name: string; data: string }>('skills.export', { id })
    downloadData(value.name, value.data)
  }
  const assistants = data?.assistants ?? [DEFAULT_ASSISTANT],
    skills = data?.skills ?? []
  const skill = skills.find((s) => s.name === selected) ?? skills[0]
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="settings-actions">
        {kind === 'assistants' ? (
          <Action primary onClick={() => setEditor({ avatar: '*', parameters: {} })}>
            <Plus size={16} />
            Add assistant
          </Action>
        ) : (
          <FeatureMenu label="Create new skill">
            <Action onClick={() => setEditor({})}>Write skill instructions</Action>
            <label className="feature-upload">
              Upload a skill
              <input
                type="file"
                aria-label="Upload a skill"
                accept=".md,.skill"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file)
                    void run('import', async () => {
                      if (file.size > 10 * 1024 * 1024) throw new Error('Skill file must be below 10 MB.')
                      await w.execute(
                        'skills.import',
                        file.name.toLowerCase().endsWith('.skill')
                          ? { data: await fileData(file) }
                          : { content: await file.text() }
                      )
                    })
                }}
              />
            </label>
          </FeatureMenu>
        )}
      </div>
      {kind === 'assistants' && (
        <section className="settings-card">
          <div className="settings-item assistant-default-picker">
            <DetailPicker
              label="Default assistant"
              name="default-assistant"
              value={data?.default_assistant ?? DEFAULT_ASSISTANT.id}
              placeholder="Choose assistant"
              choices={assistants.map((a) => ({ id: a.id, name: a.name, icon: null }))}
              onChange={(id) => void run('default', () => w.execute('assistants.default', { id }))}
            />
          </div>
          <h2 className="settings-card-heading">All assistants</h2>
          {assistants.map((a) => (
            <div className="feature-row" key={a.id}>
              <span className="feature-avatar">{a.avatar || <Bot size={22} />}</span>
              <div className="feature-row-copy">
                <strong>{a.name}</strong>
                {a.id === data?.default_assistant && <small className="feature-tag">Default</small>}
                <p>{a.description}</p>
              </div>
              <Action onClick={() => setEditor({ ...a })}>
                <Pencil size={16} />
                Edit
              </Action>
              <Action disabled={a.id === DEFAULT_ASSISTANT.id} onClick={() => setRemove(a)}>
                <Trash2 size={16} />
                Delete
              </Action>
            </div>
          ))}
        </section>
      )}
      {kind === 'skills' && (
        <div className="skills-settings">
          <aside>
            {!skills.length && <p>No skills installed.</p>}
            {skills.map((s) => (
              <div className="skill-row" key={s.name}>
                <button
                  className="skill-select"
                  onClick={() => setSelected(s.name)}
                  aria-pressed={s.name === skill?.name}
                >
                  <strong>{s.name}</strong>
                  <span>{s.description}</span>
                </button>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Enable ${s.name}`}
                  checked={s.enabled}
                  onChange={(e) =>
                    void run(s.name, () =>
                      w.execute('skills.toggle', { id: s.name, enabled: e.target.checked })
                    )
                  }
                />
                <FeatureMenu label={`Actions for ${s.name}`}>
                  <Action
                    disabled={!s.enabled}
                    onClick={() =>
                      void window.dispatchEvent(new CustomEvent('atomic:try-skill', { detail: s.name }))
                    }
                  >
                    Try in chat
                  </Action>
                  <Action onClick={() => void run('export', () => exportSkill(s.name))}>
                    <Download size={15} />
                    Download
                  </Action>
                  <Action onClick={() => setEditor({ ...s })}>
                    <Pencil size={15} />
                    Edit
                  </Action>
                  <Action onClick={() => setRemove({ id: s.name, name: s.name })}>
                    <Trash2 size={15} />
                    Delete
                  </Action>
                </FeatureMenu>
              </div>
            ))}
          </aside>
          <section className="settings-card">
            {skill ? (
              <>
                <div className="feature-row">
                  <h3>Instructions</h3>
                  <Action onClick={() => setEditor({ ...skill })}>
                    <Pencil size={15} />
                    Edit
                  </Action>
                </div>
                <pre className="skill-instructions">{skill.body}</pre>
                {!!skill.resource_names?.length && (
                  <>
                    <h3>Files</h3>
                    <ul>
                      {skill.resource_names.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div className="settings-empty">
                <FileText size={30} />
                <p>Select a skill.</p>
              </div>
            )}
          </section>
        </div>
      )}
      {editor && <FeatureEditor kind={kind} initial={editor} workspace={w} close={() => setEditor(null)} />}
      {remove && (
        <ActionConfirmation
          title={`Delete ${remove.name}?`}
          actionLabel="Delete"
          danger
          onClose={() => setRemove(null)}
          onConfirm={() => w.execute(`${kind}.remove`, { id: remove.id })}
        />
      )}
    </>
  )
}
