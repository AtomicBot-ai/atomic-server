import { useEffect, useRef, useState } from 'react'
import { loadTarget } from '../library/download-data'
import { record, text } from '../types'
import type { Workspace } from '../useWorkspace'
import { describeError } from '@/services/admin-api'

/**
 * Setup's last step: once the chosen download is ready, load it with its engine (a store or Foundry
 * Local job names its own), start the API where access asks, and complete setup — once per job; Retry
 * runs it again after a failure.
 */
export function useSetupVerify({
  workspace: w,
  target,
  engine,
  access,
  step,
  setStep,
  setError,
}: {
  workspace: Workspace
  target: string
  engine: string
  access: string
  step: number
  setStep: (step: number) => void
  setError: (error: string) => void
}) {
  const [verifying, setVerifying] = useState(false)
  const attempted = useRef('')
  const { execute } = w
  const targetJob = w.snapshot?.setups.map(record).find((job) => (job.id ?? job.setup_id) === target)
  const verify = async () => {
    if (!targetJob || targetJob.stage !== 'ready') return
    setVerifying(true)
    setError('')
    try {
      const plan = record(targetJob.plan)
      // A store or Foundry Local job names its own engine and model id; a GGUF setup its plan's.
      const load = loadTarget(targetJob)
      if (!load.model_id) throw new Error('The selected download has no model ID. Check Downloads.')
      await execute(
        plan.category ? 'artifacts.load' : 'models.load',
        plan.category ? { id: target } : { provider: engine || load.provider, model_id: load.model_id }
      )
      const config = record(record(await execute('config.get')).values)
      const api = record(config.api)
      const host =
        access === 'saved' ? text(api.host, '127.0.0.1') : access === 'lan' ? '0.0.0.0' : '127.0.0.1'
      if (
        !w.snapshot?.api.running ||
        w.snapshot.api.host !== host ||
        w.snapshot.api.port !== api.port ||
        w.snapshot.api.prefix !== api.prefix
      )
        await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', { request: { host } })
      await execute('setup.complete', { model_id: load.model_id })
      setStep(3)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setVerifying(false)
    }
  }
  useEffect(() => {
    if (!targetJob || targetJob.stage !== 'ready' || attempted.current === target || step !== 2) return
    attempted.current = target
    void verify()
    // A durable job is verified once; explicit Retry is available after a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetJob?.stage, target, step])
  return { verify, verifying, targetJob, attempted }
}
