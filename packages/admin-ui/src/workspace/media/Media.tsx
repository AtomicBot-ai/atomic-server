import { useCallback, useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Field, JsonResult, Panel } from '../Controls'
import { AdminApiError, describeError } from '@/services/admin-api'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { MediaFields } from './MediaFields'
import { mediaDefaults, mediaJob, mediaServiceMatches } from './media-data'
import { MediaStudio } from './MediaStudio'

export function Media({
  workspace: w,
  task,
  openCommand,
  onCatalog,
}: {
  workspace: Workspace
  task: string
  openCommand: (name: string) => void
  onCatalog?: () => void
}) {
  const [capabilities, setCapabilities] = useState<RecordValue>({})
  const [values, setValues] = useState<RecordValue>(() => mediaDefaults({}, task))
  const [error, setError] = useState('')
  const [result, setResult] = useState<unknown>()
  const [job, setJob] = useState<RecordValue | null>(null)
  const [gallery, setGallery] = useState<RecordValue[]>([])
  const [advanced, setAdvanced] = useState('{}')
  const { execute } = w
  const visual = task === 'image' || task === 'video'
  const loaded = w.snapshot?.services.find((row) =>
    visual ? mediaServiceMatches(row, task) : row.kind === (task === 'router' ? 'decision' : task)
  )
  const operation =
    task === 'router'
      ? 'media.router.run'
      : task === 'decision'
        ? 'media.decision.run'
        : task === 'embedding'
          ? 'media.embedding.run'
          : `media.${task}.create`
  const refreshGallery = useCallback(async () => {
    if (!visual) return
    try {
      setGallery(rows(await execute(`media.${task}.gallery`)))
    } catch (e) {
      // An untouched profile has no gallery yet; connection and other failures still surface.
      if (e instanceof AdminApiError && e.code === 'NOT_CONFIGURED') setGallery([])
      else throw e
    }
  }, [execute, task, visual])
  useEffect(() => {
    let active = true
    setError('')
    setResult(undefined)
    setJob(null)
    setGallery([])
    setCapabilities({})
    if (visual && loaded?.model)
      void execute(task === 'video' ? 'media.video.capabilities' : 'media.capabilities')
        .then((value) => {
          if (!active) return
          const cap = record(value)
          setCapabilities(cap)
          setValues(mediaDefaults(cap, task))
        })
        .catch((e) => {
          if (active) {
            setCapabilities({})
            setError(describeError(e))
          }
        })
    void refreshGallery().catch((e) => {
      if (active) setError(describeError(e))
    })
    return () => {
      active = false
    }
  }, [task, execute, visual, refreshGallery, loaded?.model])
  const jobId = text(job?.id, '')
  const pendingJob = jobId && ['queued', 'generating', 'running', 'pending'].includes(text(job?.state))
  useEffect(() => {
    if (!pendingJob) return
    let active = true
    const timer = setInterval(() => {
      void execute(`media.${task}.job`, { id: jobId })
        .then((value) => {
          if (active) {
            const current = mediaJob(value)
            setJob(current)
            if (!['queued', 'generating', 'running', 'pending'].includes(text(current.state)))
              void refreshGallery().catch((e) => {
                if (active) setError(describeError(e))
              })
          }
        })
        .catch((e) => {
          if (active) setError(describeError(e))
        })
    }, 1500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [jobId, pendingJob, execute, task, refreshGallery])
  const change = (name: string, value: unknown) => setValues((current) => ({ ...current, [name]: value }))
  const request = (): RecordValue => {
    const extra = record(JSON.parse(advanced))
    if (task === 'embedding') return { input: text(values.prompt, ''), ...extra }
    if (task === 'decision')
      return {
        state: text(values.prompt, ''),
        questions: {
          result: {
            type: values.questionType || 'noul',
            instructions: text(values.instructions, ''),
            ...(values.criteria ? { criteria: JSON.parse(String(values.criteria)) } : {}),
          },
        },
        ...extra,
      }
    if (task === 'router')
      return {
        task: text(values.prompt, ''),
        criterion: text(values.criterion, ''),
        candidates: JSON.parse(text(values.candidates, '[]')),
        ...extra,
      }
    const data = { ...values, ...extra }
    if (task === 'video') delete data.batchSize
    return data
  }
  const generate = async () => {
    const value = await execute(operation, { request: request() })
    if (!visual) {
      setResult(value)
      return
    }
    const created = record(value)
    const id = created.jobId ?? mediaJob(value).id
    if (!id) throw new Error('Generation did not return a job ID.')
    const next = mediaJob(await execute(`media.${task}.job`, { id }))
    setJob(next)
    if (!['queued', 'generating', 'running', 'pending'].includes(text(next.state))) await refreshGallery()
  }
  if (visual)
    return (
      <MediaStudio
        workspace={w}
        task={task}
        model={loaded?.model}
        capabilities={capabilities}
        values={values}
        change={change}
        advanced={advanced}
        setAdvanced={setAdvanced}
        error={error}
        result={result}
        job={job}
        gallery={gallery}
        pending={Boolean(pendingJob)}
        generate={generate}
        cancel={async () => {
          await execute(`media.${task}.cancel`, { id: job?.id })
          setJob(mediaJob(await execute(`media.${task}.job`, { id: job?.id })))
        }}
        refresh={refreshGallery}
        reset={() => {
          setValues((current) => ({
            ...mediaDefaults(capabilities, task),
            prompt: current.prompt,
            negativePrompt: current.negativePrompt,
            workflow: current.workflow,
          }))
          setAdvanced('{}')
        }}
        restore={(recipe) =>
          setValues((current) => ({
            ...current,
            ...Object.fromEntries(
              Object.entries(recipe).filter(([key]) =>
                [
                  'prompt',
                  'negativePrompt',
                  'width',
                  'height',
                  'steps',
                  'cfgScale',
                  'guidance',
                  'batchSize',
                  'seed',
                  'frames',
                  'fps',
                  'workflow',
                ].includes(key)
              )
            ),
          }))
        }
        estimate={async () => setResult(await execute('media.video.estimate', { request: request() }))}
        onCatalog={onCatalog ?? (() => openCommand('media.load'))}
      />
    )
  return (
    <div className="media-layout">
      <Panel
        title={{ embedding: 'Embeddings', decision: 'Decisions', router: 'Router' }[task] || task}
        actions={
          <Action onClick={() => openCommand(`media.${task === 'router' ? 'decision' : task}.configure`)}>
            Configure model
          </Action>
        }
      >
        <p className="ew-muted">{loaded ? loaded.model : 'Load a compatible model in Models.'}</p>
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        <Field label={task === 'embedding' ? 'Input' : task === 'decision' ? 'State' : 'Task'}>
          <textarea value={text(values.prompt, '')} onChange={(e) => change('prompt', e.target.value)} />
        </Field>
        <MediaFields task={task} capabilities={capabilities} values={values} change={change} />
        <details>
          <summary>Additional parameters</summary>
          <textarea
            className="code-input"
            aria-label="Additional parameters"
            value={advanced}
            onChange={(e) => setAdvanced(e.target.value)}
          />
        </details>
        <Action primary disabled={!loaded || !String(values.prompt ?? '').trim()} onClick={generate}>
          {task === 'embedding' ? 'Embed' : 'Run'}
        </Action>
        <JsonResult value={result} />
      </Panel>
    </div>
  )
}
