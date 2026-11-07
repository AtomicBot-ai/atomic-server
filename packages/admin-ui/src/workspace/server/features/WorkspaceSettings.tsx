// Lifted from atomic-chat-ui/web-app/src/routes/settings/assistant.tsx, routes/connectors/index.tsx and routes/skills/index.tsx @ 807b4d9; adapted: shared server-owned features.
import { AssistantsSettings } from './AssistantsSettings'
import { FileInput } from '../../FileInput'
import { FeatureMenu } from './FeatureMenu'
import { fileData, downloadData } from '../../file-data'
import { useState } from 'react'
import { FileText, Pencil, Trash2, Download } from 'lucide-react'
import type { Workspace } from '../../useWorkspace'
import { Action } from '../../Controls'
import { ActionConfirmation } from '../../ActionConfirmation'
import { FeatureEditor } from './FeatureEditor'
import { ConnectorsSettings } from '../connectors/ConnectorsSettings'
import { AttachmentSettings } from './AttachmentSettings'
import './workspace-features.css'
import { describeError } from '@/services/admin-api'
type Value = Record<string, unknown>
export function WorkspaceSettings({ section, workspace: w }: { section: string; workspace: Workspace }) {
  const [editor, setEditor] = useState<Value | null>(null),
    [remove, setRemove] = useState<{ id: string; name: string } | null>(null)
  const [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [, setBusy] = useState('')
  if (section === 'attachments') return <AttachmentSettings workspace={w} />
  if (section === 'connectors') return <ConnectorsSettings workspace={w} />
  if (section === 'assistants') return <AssistantsSettings workspace={w} />
  const kind = 'skills',
    data = w.snapshot?.features
  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy('')
    }
  }
  const exportSkill = async (id: string) => {
    const value = await w.execute<{ name: string; data: string }>('skills.export', { id })
    downloadData(value.name, value.data)
  }
  const skills = data?.skills ?? []
  const skill = skills.find((s) => s.name === selected) ?? skills[0]
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="settings-actions">
        <FeatureMenu label="Create new skill">
          <Action onClick={() => setEditor({})}>Write skill instructions</Action>
          <FileInput
            label="Upload a skill"
            accept=".md,.skill"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file)
                return run('import', async () => {
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
        </FeatureMenu>
      </div>
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
