import { readinessPatch } from './chat/readiness.js'
import { failedTurn } from './chat/failed-turn.js'
import { useDownloadAttention } from './downloads/use-download-attention.js'
import { chatFeatureRequest } from './chat/features.js'
import { useSharedPanels } from './runtime/shared-panels.js'
import { useOtherTurn } from './runtime/other-turn.js'
import { useMediaJobs } from './media/media-effects.js'
import { IntroScreen } from './intro/IntroScreen.js'
import { messageText, type ChatMessage } from '../../terminal-service/index.js'
import { useRuntimeData, useWaitingGame } from './runtime/runtime-effects.js'
import { persistConversation } from './server/data-actions.js'
import { startup } from './startup.js'
import { isPicker } from './chat/picker.js'
import { chosenEndpoint } from './chat/model-selection.js'
import { useWorkspaceData } from './runtime/data-effects.js'
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
import { workspaceInputs } from './input/input-sequence.js'
import { activate } from './actions.js'
import { CanvasRow } from './draw/CanvasRow.js'
import { captureFailure } from '../../telemetry/index.js'
export interface WorkspaceProps {
  showIntro?: boolean
  onLaunch?: (launch: AgentLaunch) => void
  initialMessage?: string
  root?: CommandSpec
  deps: WorkspaceDeps
  initialPage?: Page
  color: boolean
  trueColor?: boolean
  write: (value: string) => void
}
export function WorkspaceApp(props: WorkspaceProps) {
  const [intro, setIntro] = useState(props.showIntro ?? true)
  const [resume, setResume] = useState<WorkspaceState | null>(null)
  return intro ? (
    <IntroScreen {...props} forceWelcome={resume !== null} onContinue={() => setIntro(false)} />
  ) : (
    <WorkspaceContent
      {...props}
      resume={resume}
      onIntro={(state) => {
        setResume(state)
        setIntro(true)
      }}
    />
  )
}
function WorkspaceContent(
  props: WorkspaceProps & { resume: WorkspaceState | null; onIntro: (state: WorkspaceState) => void }
) {
  const [state, setState] = useState(
      () =>
        props.resume ?? {
          ...createWorkspace(props.initialPage),
          message: props.initialMessage ?? '',
          commands: props.root ? commandRows(props.root) : [],
        }
    ),
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
  const { deps, initialPage, write, resume } = props
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
        if (!resume) patch(saved)
        if (saved.setup)
          void c.setup.resume().catch((e) => {
            captureFailure(deps.base.errors, e, { component: 'tui', operation: 'setup.resume' })
            if (live) patch({ message: oneLine(e) })
          })
      })
      .catch((e) => {
        captureFailure(deps.base.errors, e, { component: 'tui', operation: 'workspace.start' })
        if (live) patch({ message: oneLine(e), ready: true })
      })
    return () => {
      live = false
      activeEpoch.current++
      c.dispose()
    }
  }, [deps, initialPage, patch, update, resume])
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
  useSharedPanels(state.ready, latest, controller, update)
  useOtherTurn(state, latest, controller, update)
  useMediaJobs(state.ready, latest, controller, update)
  useRuntimeData(state.ready, controller, update)
  useWaitingGame(state, update)
  const downloadHighlight = useDownloadAttention(state.downloadAttention ?? 0, state.motion)
  const frame = workspaceFrame(state, columns, rows, seconds, 'fangs', downloadHighlight)
  function cancel() {
    if (!latest.current.generating) return
    epoch.current++
    controller.current?.cancel()
    patch({ generating: false, message: 'Response stopped.' })
  }
  function send() {
    const s = latest.current,
      c = controller.current
    if (
      !c ||
      s.generating ||
      (!s.draft.trim() && !s.images.length && !s.documents?.length && s.messages.at(-1)?.role !== 'tool')
    )
      return
    const blocked = readinessPatch(s)
    if (blocked) {
      patch(blocked)
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
    const messages =
        s.draft.trim() || s.images.length || s.documents?.length ? [...s.messages, message] : s.messages,
      id = ++epoch.current
    patch({
      conversation: s.conversation ?? {
        ...c.history.create(chosenEndpoint(s) ?? '', s.model, process.cwd()),
        title: s.draft.trim().replace(/\s+/g, ' ').slice(0, 70),
      },
      messages: [...messages, { role: 'assistant', content: '' }],
      draft: '',
      images: [],
      documents: [],
      cursor: 0,
      generating: true,
      message: '',
      scroll: 0,
    })
    void c
      .chat(
        chosenEndpoint(s),
        s.model,
        messages,
        (token) => {
          if (epoch.current === id)
            update((v) => ({
              ...v,
              messages: v.messages.map((m, i) =>
                i === v.messages.length - 1 ? { ...m, content: messageText(m.content) + token } : m
              ),
            }))
        },
        chatFeatureRequest(s),
        s.conversation?.id,
        s.documents,
        s.conversation?.revision
      )
      .then((response) => {
        if (epoch.current === id)
          update((v) => ({
            ...v,
            generating: false,
            messages: response
              ? [...(response.messages ?? v.messages.slice(0, -1)), response.message]
              : v.messages,
            conversation:
              response && v.conversation
                ? {
                    ...v.conversation,
                    id: response.conversation_id,
                    ...(response.revision !== undefined ? { revision: response.revision } : {}),
                    request_settings: chatFeatureRequest(s),
                  }
                : v.conversation,
            ...(response?.message.tool_calls?.length
              ? { overlay: 'chat-tools', focus: 'chat-tools-approve' }
              : {}),
          }))
      })
      .catch((e) => {
        captureFailure(deps.base.errors, e, { component: 'tui', operation: 'chat.send' })
        if (epoch.current === id) patch(failedTurn(latest.current, s, oneLine(e)))
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
    if (id === 'first-intro') return props.onIntro(latest.current)
    if (
      !controller.current ||
      (latest.current.busy && ['api-toggle', 'stop-confirm', 'refresh-models'].includes(id))
    )
      return
    void activate(id, context()).catch((e) => {
      captureFailure(deps.base.errors, e, { component: 'tui', operation: 'workspace.action' })
      patch({
        message: oneLine(e),
        busy: false,
        ...(isPicker(latest.current.overlay) ? { pickerError: oneLine(e) } : {}),
      })
    })
  }
  useInput((input, key: Key) => {
    if (!latest.current.ready) return
    const frame = workspaceFrame(latest.current, columns, rows, seconds)
    for (const result of workspaceInputs(input, key, latest.current, frame, leader.current)) {
      if (result.leader !== undefined) leader.current = result.leader
      else if (leader.current) leader.current = false
      if (result.patch) patch(result.patch)
      if (result.quit || result.action === 'quit') {
        const current = controller.current
        if (current)
          void persistConversation({ get: () => latest.current, controller: current, update }).then(
            () => exit(),
            (e) => patch({ message: oneLine(e) })
          )
        else exit()
        return
      }
      if (result.action) run(result.action)
    }
  })
  if (!state.ready)
    return (
      <Box>
        <Text>Opening Atomic Server...</Text>
      </Box>
    )
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {frame.cells.map((row, i) => (
        <CanvasRow key={i} cells={row} color={props.color} trueColor={props.trueColor ?? false} />
      ))}
    </Box>
  )
}
