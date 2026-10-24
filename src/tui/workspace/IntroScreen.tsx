import { useIntroEngine } from './use-intro-engine.js'
import { drawIntroEngines } from './intro-engines.js'
import { CanvasRow } from './draw/CanvasRow.js'
import { hit } from './draw/canvas.js'
import { mouseReport } from './mouse-report.js'
import { engineName } from '../../workspace-view/index.js'
import { useEffect, useRef, useState } from 'react'
import { Box, useApp, useInput, useWindowSize } from 'ink'
import { introInput } from './intro-art.js'
import { introCanvas } from './intro-canvas.js'
import type { WorkspaceProps } from './WorkspaceApp.js'

export function IntroScreen({
  onContinue,
  deps,
  color,
  trueColor,
  write,
  forceWelcome = false,
}: WorkspaceProps & { onContinue: () => void; forceWelcome?: boolean }) {
  const { columns, rows } = useWindowSize()
  const engine = useIntroEngine(deps, forceWelcome)
  const { exit } = useApp()
  const [seconds, setSeconds] = useState(0)
  const [motion, setMotion] = useState(true)
  const [ready, setReady] = useState(false)
  const continued = useRef(false)
  const enter = () => {
    if (continued.current) return
    continued.current = true
    onContinue()
  }
  useEffect(() => {
    if (engine.stage === 'resume' && !continued.current) {
      continued.current = true
      onContinue()
    }
  }, [engine.stage, onContinue])
  useEffect(() => {
    let live = true
    void deps.base
      .loadConfig()
      .then((c) => {
        if (live) setMotion(c.values.tui.motion)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [deps])
  useEffect(() => {
    if (!motion) return
    const start = Date.now()
    const timer = setInterval(() => setSeconds((Date.now() - start) / 1000), 100)
    return () => clearInterval(timer)
  }, [motion])
  useEffect(() => {
    write('\u001b[?1000h\u001b[?1006h')
    return () => write('\u001b[?1000l\u001b[?1006l')
  }, [write])
  useInput((input, key) => {
    const mouse = mouseReport(input)
    if (mouse && engine.stage === 'engines') {
      if (mouse.released) return
      if (mouse.code & 64) {
        engine.setSelected((i) =>
          Math.max(0, Math.min(engine.choices.length - 1, i + (mouse.code & 1 ? 1 : -1)))
        )
        return
      }
      if (mouse.code !== 0) return
      const target = hit(
        drawIntroEngines(columns, rows, engine.choices, engine.selected, engine.error, seconds),
        mouse.x,
        mouse.y
      )
      if (target?.id === 'quit') exit()
      else if (target?.id === 'back') engine.back()
      else if (target?.id === 'skip') enter()
      else if (target?.id === 'retry') void engine.choose()
      else if (target?.id.startsWith('engine:')) {
        const index = Number(target.id.slice(7))
        engine.setSelected(index)
        void engine.install(index)
      }
      return
    }
    if (mouse && (engine.stage === 'ready' || engine.stage === 'choose')) {
      if (mouse.released || mouse.code !== 0) return
      const target = hit(
        introCanvas(
          columns,
          rows,
          seconds,
          motion,
          engine.stage === 'ready' ? 'Press any key' : 'Choose engine'
        ),
        mouse.x,
        mouse.y
      )
      if (target?.id === 'intro-continue') {
        if (engine.stage === 'ready') enter()
        else void engine.choose()
      }
      return
    }
    const result = introInput(input, key)
    if (result === 'quit') exit()
    else if (result === 'continue') {
      if (engine.stage === 'choose') void engine.choose()
      else if (engine.stage === 'ready') enter()
      else if (engine.stage === 'engines') {
        if (key.escape) engine.back()
        else if (input.toLowerCase() === 's') enter()
        else if (key.upArrow || key.downArrow || key.tab)
          engine.setSelected(
            (i) =>
              (i + (key.upArrow || key.shift ? -1 : 1) + engine.choices.length) %
              Math.max(1, engine.choices.length)
          )
        else if (key.return || input === ' ')
          void (engine.choices.length ? engine.install() : engine.choose())
      }
    }
  })
  // Show the prompt only after Ink has attached its input listener.
  useEffect(() => setReady(true), [])
  if (!ready) return null
  if (engine.stage === 'engines')
    return (
      <Box flexDirection="column" width={columns} height={rows}>
        {drawIntroEngines(
          columns,
          rows,
          engine.choices,
          engine.selected,
          engine.error,
          motion ? seconds : 0
        ).cells.map((cells, i) => (
          <CanvasRow key={i} cells={cells} color={color} trueColor={trueColor ?? false} />
        ))}
      </Box>
    )
  const prompt =
    engine.stage === 'ready'
      ? 'Press any key'
      : engine.stage === 'choose'
        ? 'Choose engine'
        : engine.stage === 'installing'
          ? `Adding ${engineName(engine.name)} download`
          : 'Checking setup'
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {introCanvas(
        columns,
        rows,
        seconds,
        motion,
        prompt,
        engine.stage === 'installing' ? { name: engine.name, progress: engine.progress } : undefined
      ).cells.map((cells, i) => (
        <CanvasRow key={i} cells={cells} color={color} trueColor={trueColor ?? false} />
      ))}
    </Box>
  )
}
