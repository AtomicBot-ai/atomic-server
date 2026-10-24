import { setupFinished } from '../../workspace-view/index.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EngineChoice } from '../../terminal-setup/index.js'
import { WorkspaceController } from './controller.js'
import type { WorkspaceDeps } from './controller.js'
export function useIntroEngine(deps: WorkspaceDeps, forceWelcome = false) {
  const controller = useMemo(
    () =>
      new WorkspaceController(
        deps,
        () => {},
        () => {},
        () => {}
      ),
    [deps]
  )
  const [stage, setStage] = useState<'checking' | 'choose' | 'engines' | 'installing' | 'ready' | 'resume'>(
    'checking'
  )
  const [choices, setChoices] = useState<EngineChoice[]>([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const busy = useRef(false),
    live = useRef(true)
  useEffect(() => {
    live.current = true
    void Promise.all([controller.engineSelection.read(), controller.setup.read(), controller.runtime.setup()])
      .then(async ([engine, manifest, setup]) => {
        if (manifest || setupFinished(setup)) {
          if (live.current) setStage(forceWelcome && !setupFinished(setup) ? 'ready' : 'resume')
          return
        }
        if (engine) {
          if (live.current) setStage('ready')
          return
        }
        const installed = await controller.setup.installed().catch(() => [])
        if (live.current) setStage(installed.length ? 'ready' : 'choose')
      })
      .catch(() => {
        if (live.current) setStage('choose')
      })
    return () => {
      live.current = false
      controller.dispose()
    }
  }, [controller, forceWelcome])
  useEffect(() => {
    let active = true,
      pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const setup = await controller.runtime.setup()
        if (active && setupFinished(setup)) setStage('resume')
      } catch {
        // A failed read is not evidence that setup changed; retry at the next tick.
      } finally {
        pending = false
      }
    }
    const timer = setInterval(() => void refresh(), 2500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [controller])
  const choose = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setError('')
    setChoices([])
    setStage('engines')
    try {
      const catalogs = await controller.setup.catalogs()
      const builds = await controller.engineSelection.list(catalogs)
      const list = catalogs.flatMap((catalog) => {
        const recommended =
          catalog.available.find((b) => `${b.version}/${b.backend}` === catalog.recommended) ??
          catalog.available[0]
        if (!recommended) return []
        const id = `${catalog.provider}|${recommended.version}|${recommended.backend}`
        return [
          builds.find((b) => b.id === id) ?? {
            id,
            provider: catalog.provider,
            version: recommended.version,
            backend: recommended.backend,
            installed: false,
          },
        ]
      })
      if (live.current) {
        setChoices([
          ...list,
          ...builds.filter((b) => b.installed && !list.some((v) => v.provider === b.provider)),
        ])
        setSelected(0)
        if (!list.length && !builds.some((b) => b.installed))
          setError('No compatible engines are available. Retry or set up later.')
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      busy.current = false
    }
  }, [controller])
  const install = async (index = selected) => {
    const choice = choices[index]
    if (!choice || busy.current) return
    busy.current = true
    setError('')
    setName(choice.provider)
    setStage('installing')
    try {
      if (choice.installed) {
        await controller.engineSelection.select(choice)
        if (live.current) setStage('ready')
      } else {
        await controller.runtime.execute('engines.enqueue', {
          engine: choice.provider,
          target: { version: choice.version, variant: choice.backend },
          select: true,
        })
        if (live.current) setStage('resume')
      }
    } catch (e) {
      if (live.current) {
        setError(e instanceof Error ? e.message : String(e))
        setStage('engines')
      }
    } finally {
      busy.current = false
    }
  }
  const back = () => {
    if (stage === 'engines') setStage('choose')
  }
  return { stage, choices, selected, setSelected, error, name, progress: null, choose, install, back }
}
