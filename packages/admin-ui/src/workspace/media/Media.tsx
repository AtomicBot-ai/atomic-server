import { useCallback, useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Empty, Field, JsonResult, Panel } from '../Controls'
import { AdminApiError, describeError } from '@/services/admin-api'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { MediaFields } from './MediaFields'
import { mediaDefaults, mediaJob } from './media-data'

export function Media({
  workspace: w,
  task,
  openCommand,
}: {
  workspace: Workspace
  task: string
  openCommand: (name: string) => void
}) {
  const [capabilities, setCapabilities] = useState<RecordValue>({})
  const [values, setValues] = useState<RecordValue>({
    prompt: '',
    width: 512,
    height: 512,
    steps: 20,
    cfgScale: 7,
    batchSize: 1,
    workflow: 'create',
  })
  const [error, setError] = useState('')
  const [result, setResult] = useState<unknown>()
  const [job, setJob] = useState<RecordValue | null>(null)
  const [gallery, setGallery] = useState<RecordValue[]>([])
  const [advanced, setAdvanced] = useState('{}')
  const { execute } = w
  const visual = task === 'image' || task === 'video'
  const loaded = w.snapshot?.services.find((row) =>
    visual ? row.kind === 'image-video' : row.kind === (task === 'router' ? 'decision' : task)
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
              void refreshGallery()
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
  return (
    <div className="media-layout">
      <Panel
        title={
          {
            image: 'Images',
            video: 'Video',
            embedding: 'Embeddings',
            decision: 'Decisions',
            router: 'Router',
          }[task] || task
        }
        actions={
          <Action
            onClick={() =>
              openCommand(visual ? 'media.load' : `media.${task === 'router' ? 'decision' : task}.configure`)
            }
          >
            Configure model
          </Action>
        }
      >
        <p className="ew-muted">{loaded ? loaded.model : 'Load a compatible model in Engines & Models.'}</p>
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        <Field
          label={
            task === 'embedding'
              ? 'Input'
              : task === 'decision'
                ? 'State'
                : task === 'router'
                  ? 'Task'
                  : 'Prompt'
          }
        >
          <textarea
            value={text(values.prompt, '')}
            onChange={(e) => change('prompt', e.target.value)}
            placeholder=""
          />
        </Field>
        <MediaFields task={task} capabilities={capabilities} values={values} change={change} />
        <details>
          <summary>Additional parameters</summary>
          <textarea className="code-input" value={advanced} onChange={(e) => setAdvanced(e.target.value)} />
          <details>
            <summary>Model capabilities</summary>
            <JsonResult value={capabilities} />
          </details>
        </details>
        <div className="ew-actions">
          <Action
            primary
            disabled={
              Boolean(pendingJob) ||
              !loaded ||
              (visual && !Array.isArray(capabilities.workflows)) ||
              !String(values.prompt ?? '').trim()
            }
            onClick={async () => {
              const value = await execute(operation, { request: request() })
              if (visual) {
                const created = record(value)
                const id = created.jobId ?? mediaJob(value).id
                if (!id) throw new Error('Generation did not return a job ID.')
                setJob(mediaJob(await execute(`media.${task}.job`, { id })))
              } else setResult(value)
            }}
          >
            {visual ? 'Generate' : task === 'embedding' ? 'Embed' : 'Run'}
          </Action>
          {task === 'video' && (
            <Action
              disabled={!loaded}
              onClick={async () => setResult(await execute('media.video.estimate', { request: request() }))}
            >
              Estimate
            </Action>
          )}
        </div>
        {job && (
          <div className="job-progress">
            <div className="ew-actions">
              <strong>{text(job.state)}</strong>
              {pendingJob && (
                <Action
                  onClick={async () => {
                    if (window.confirm('Cancel generation? The engine may need to restart.')) {
                      setResult(await execute(`media.${task}.cancel`, { id: job.id }))
                      setJob(mediaJob(await execute(`media.${task}.job`, { id: job.id })))
                    }
                  }}
                >
                  Cancel
                </Action>
              )}
            </div>
            <progress max={1} value={Number(record(job.progress).fraction || 0)} />
            <small>
              {text(record(job.progress).phase, '')} · {text(record(job.progress).step, '0')} /{' '}
              {text(record(job.progress).totalSteps, '?')} steps
              {record(job.progress).etaSeconds != null
                ? ` · ${Math.ceil(Number(record(job.progress).etaSeconds))}s remaining`
                : ''}
            </small>
            {Boolean(job.error) && <JsonResult value={job.error} />}
          </div>
        )}
        <JsonResult value={result} />
      </Panel>
      {visual && (
        <Panel title="Gallery" actions={<Action onClick={refreshGallery}>Refresh</Action>}>
          {gallery.length ? (
            <div className="gallery-grid">
              {gallery.map((item, i) => (
                <article key={text(item.id, String(i))}>
                  {task === 'image' ? (
                    <img
                      src={`/api/workspace/artifacts/image/${encodeURIComponent(text(item.id))}`}
                      alt={text(record(item.recipe).prompt, 'Generated image')}
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={`/api/workspace/artifacts/video/${encodeURIComponent(text(item.id))}`}
                      controls
                      preload="metadata"
                    />
                  )}
                  <small>{text(record(item.recipe).prompt ?? item.prompt, text(item.id))}</small>
                  <a
                    className="ew-button"
                    href={`/api/workspace/artifacts/${task}/${encodeURIComponent(text(item.id))}`}
                    download
                  >
                    Save
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <Empty>No generated {task === 'image' ? 'images' : 'videos'}.</Empty>
          )}
        </Panel>
      )}
    </div>
  )
}
