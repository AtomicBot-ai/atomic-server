import { messageText } from '../../terminal-service/index.js'
import type { ChatMessage } from '../../terminal-service/index.js'
import { useRuntimeData } from './runtime-effects.js'
import { persistConversation } from './data-actions.js'
import { startup } from './startup.js'
import { isPicker } from './chat/picker.js'
import { useWorkspaceData } from './data-effects.js'
import type { AgentLaunch } from '../../agent-launch/index.js'
import { Box, Text, useApp, useInput, useWindowSize } from 'ink'
import type { Key } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { commandRows } from '../command-list.js'
import type { CommandSpec } from '../../cli/index.js'
import { reduce } from '../state.js'
import type { TuiAction } from '../state.js'
import { oneLine } from '../controller.js'
import { WorkspaceController } from './controller.js'
import type { WorkspaceDeps } from './controller.js'
import { createWorkspace } from './state.js'
import type { Page, WorkspaceState } from './state.js'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { activate } from './actions.js'
import { COLORS } from './draw/canvas.js'
import type { Cell } from './draw/canvas.js'
const lightSurfaces = new Set([
  COLORS.text,
  COLORS.composer,
  COLORS.composerFrame,
  COLORS.modelButton,
  COLORS.sendButton,
])
export interface WorkspaceProps {
  onLaunch?: (launch: AgentLaunch) => void
  initialMessage?: string
  root?: CommandSpec
  deps: WorkspaceDeps
  initialPage?: Page
  color: boolean
  trueColor?: boolean
  write: (value: string) => void
}
function Row({ cells, color, trueColor }: { cells: Cell[]; color: boolean; trueColor: boolean }) {
  const runs: { text: string; color: string; background: string | undefined; bold: boolean | undefined }[] =
    []
  for (const c of cells) {
    const last = runs.at(-1)
    if (last && last.color === c.color && last.background === c.background && last.bold === c.bold)
      last.text += c.char
    else runs.push({ text: c.char, color: c.color, background: c.background, bold: c.bold })
  }
  return (
    <Text {...(color && trueColor ? { backgroundColor: COLORS.ground } : {})}>
      {runs.map((r, i) => (
        <Text
          key={i}
          bold={r.bold === true}
          {...(color
            ? {
                color: trueColor
                  ? r.color
                  : lightSurfaces.has(r.background ?? '')
                    ? 'white'
                    : r.color === COLORS.gold
                      ? 'cyan'
                      : r.color === COLORS.ground
                        ? 'black'
                        : r.color === COLORS.text
                          ? 'white'
                          : r.color === COLORS.green
                            ? 'cyan'
                            : r.color === COLORS.muted || r.color === COLORS.line || r.color === COLORS.stone
                              ? 'gray'
                              : 'cyan',
              }
            : {})}
          {...(color && trueColor && r.background ? { backgroundColor: r.background } : {})}
          inverse={
            (!color || !trueColor) && (lightSurfaces.has(r.background ?? '') || r.background === COLORS.focus)
          }
        >
          {r.text}
        </Text>
      ))}
    </Text>
  )
}
export function WorkspaceApp(props: WorkspaceProps) {
  const [state, setState] = useState(() => ({
      ...createWorkspace(props.initialPage),
      message: props.initialMessage ?? '',
      commands: props.root ? commandRows(props.root) : [],
    })),
    [seconds, setSeconds] = useState(0)
  const latest = useRef(state),
    controller = useRef<WorkspaceController | undefined>(undefined),
    epoch = useRef(0),
    leader = useRef(false)
  const { columns, rows } = useWindowSize(),
    { exit } = useApp()
  const update = useCallback((fn: (s: WorkspaceState) => WorkspaceState) => {
    latest.current = fn(latest.current)
    setState(latest.current)
  }, [])
  const patch = useCallback((p: Partial<WorkspaceState>) => update((s) => ({ ...s, ...p })), [update])
  const { deps, initialPage, write } = props
  useEffect(() => {
    let live = true
    const activeEpoch = epoch
    const c = new WorkspaceController(
      deps,
      (a: TuiAction) => {
        if (live) update((s) => ({ ...s, base: reduce(s.base, a) }))
      },
      (row) => {
        if (live)
          update((s) => ({
            ...s,
            requests: [row, ...s.requests.filter((r) => r.id !== row.id)].slice(0, 200),
          }))
      },
      (message) => {
        if (live) patch({ message })
      }
    )
    controller.current = c
    c.start()
    void startup(c, initialPage)
      .then((saved) => {
        if (!live) return
        patch(saved)
        if (saved.setup)
          void c.setup.resume().catch((e) => {
            if (live) patch({ message: oneLine(e) })
          })
      })
      .catch((e) => {
        if (live) patch({ message: oneLine(e), ready: true })
      })
    return () => {
      live = false
      activeEpoch.current++
      c.dispose()
    }
  }, [deps, initialPage, patch, update])
  const instance = state.base.daemon.kind === 'up' ? state.base.daemon.snapshot.instance_id : ''
  useEffect(() => {
    void controller.current?.observe(instance)
  }, [instance])
  useEffect(() => {
    if (!state.motion) return
    const start = Date.now()
    const timer = setInterval(() => setSeconds((Date.now() - start) / 1000), 140)
    return () => clearInterval(timer)
  }, [state.motion, state.page, state.messages.length, state.overlay])
  useEffect(() => {
    write(state.mouse ? '\u001b[?1000h\u001b[?1003h\u001b[?1006h' : '\u001b[?1000l\u001b[?1003l\u001b[?1006l')
  }, [state.mouse, write])
  useWorkspaceData(state, latest, controller, update)
  useRuntimeData(state.ready, controller, update)
  const frame = workspaceFrame(state, columns, rows, seconds)
  function cancel() {
    epoch.current++
    controller.current?.cancel()
    patch({ generating: false, message: latest.current.generating ? 'Response stopped.' : '' })
  }
  function send() {
    const s = latest.current,
      c = controller.current
    if (!c || s.generating || !s.draft.trim()) return
    if (!s.model) {
      patch({ message: 'Choose a model before sending your message.' })
      return
    }
    const message: ChatMessage = {
      role: 'user',
      content: s.images.length
        ? [
            { type: 'text', text: s.draft.trim() },
            ...s.images.map((image) => ({ type: 'image_url' as const, image_url: { url: image.url } })),
          ]
        : s.draft.trim(),
    }
    const messages = [...s.messages, message],
      id = ++epoch.current
    patch({
      conversation: s.conversation ?? {
        ...c.history.create(s.endpoint, s.model, process.cwd()),
        title: s.draft.trim().replace(/\s+/g, ' ').slice(0, 70),
      },
      messages: [...messages, { role: 'assistant', content: '' }],
      draft: '',
      images: [],
      cursor: 0,
      generating: true,
      message: '',
      scroll: 0,
    })
    void c
      .chat(s.endpoint, s.model, messages, (token) => {
        if (epoch.current === id)
          update((v) => ({
            ...v,
            messages: v.messages.map((m, i) =>
              i === v.messages.length - 1 ? { ...m, content: messageText(m.content) + token } : m
            ),
          }))
      })
      .then(() => {
        if (epoch.current === id) patch({ generating: false })
      })
      .catch((e) => {
        if (epoch.current === id) patch({ generating: false, message: oneLine(e) })
      })
  }
  const context = () => ({
    handoff: (launch: AgentLaunch) => {
      props.onLaunch?.(launch)
      exit()
    },
    get: () => latest.current,
    update,
    controller: controller.current!,
    send,
    cancel,
    copy: (value: string) => write(`\u001b]52;c;${Buffer.from(value).toString('base64')}\u0007`),
  })
  const run = (id: string) => {
    if (
      !controller.current ||
      (latest.current.busy && ['api-toggle', 'stop-confirm', 'refresh-models'].includes(id))
    )
      return
    void activate(id, context()).catch((e) =>
      patch({
        message: oneLine(e),
        busy: false,
        ...(isPicker(latest.current.overlay) ? { pickerError: oneLine(e) } : {}),
      })
    )
  }
  useInput((input, key: Key) => {
    if (!latest.current.ready) return
    const result = workspaceInput(
      input,
      key,
      latest.current,
      workspaceFrame(latest.current, columns, rows, seconds),
      leader.current
    )
    if (result.leader !== undefined) leader.current = result.leader
    else if (leader.current) leader.current = false
    if (result.patch) patch(result.patch)
    if (result.quit || result.action === 'quit') {
      const current = controller.current
      if (current)
        void persistConversation({ get: () => latest.current, controller: current }).then(
          () => exit(),
          (e) => patch({ message: oneLine(e) })
        )
      else exit()
      return
    }
    if (result.action) run(result.action)
  })
  if (!state.ready)
    return (
      <Box>
        <Text>Opening Atomic Chat...</Text>
      </Box>
    )
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {frame.cells.map((row, i) => (
        <Row key={i} cells={row} color={props.color} trueColor={props.trueColor ?? false} />
      ))}
    </Box>
  )
}
