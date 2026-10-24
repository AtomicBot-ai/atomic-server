import { expect, it } from 'vitest'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { COLORS, hit } from '../draw/canvas.js'

const warning =
  'No inference engine is installed. Install llama.cpp in Models Hub, then retry this connection.'
function fixture(error: string): WorkspaceState {
  return {
    ...createWorkspace('welcome'),
    firstRun: 'connect',
    overlay: 'connection-guide',
    focus: 'guide-configure',
    installed: [{ id: 'chosen-model', name: 'Chosen model', provider: 'llamacpp-upstream' }],
    workspace: {
      api: { running: true, port: 1337 },
      setups: [
        {
          id: 'optional',
          stage: 'downloading',
          plan: { model_id: 'Optional image', total_download_bytes: 100 },
        },
      ],
      downloads: [],
    } as never,
    connection: {
      step: 'review',
      path: 'agent',
      agent: 'codex',
      model: 'chosen-model',
      provider: 'llamacpp-upstream',
      port: '1337',
      more: false,
      agentPage: 0,
      error,
      status: '',
      command: '',
      endpoint: '',
      keyId: '',
    },
  }
}

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('shows complete recovery instructions above Retry at %s×%s', (width, height) => {
  const frame = workspaceFrame(fixture(warning), width!, height!, 0)
  const retry = frame.targets.find((target) => target.id === 'guide-configure')!
  const errors = frame.cells
    .map((line, y) => ({
      y,
      text: line
        .filter((cell) => cell.color === COLORS.red)
        .map((cell) => cell.char)
        .join('')
        .trim(),
    }))
    .filter((line) => line.text)
  expect(errors.map((line) => line.text).join(' ')).toBe(warning)
  expect(errors.every((line) => line.y < retry.y)).toBe(true)
  expect(hit(frame, retry.x, retry.y)?.id).toBe('guide-configure')
  expect(retry.y + retry.height).toBeLessThanOrEqual(height! - 4)
  for (const field of ['guide-model', 'guide-engine', 'guide-models'])
    expect(frame.targets.some((target) => target.id === field)).toBe(true)
})

it('bounds unusually long errors without overwriting Retry or footer controls', () => {
  const frame = workspaceFrame(fixture(warning.repeat(6)), 54, 24, 0)
  const retry = frame.targets.find((target) => target.id === 'guide-configure')!
  const errors = frame.cells
    .map((line, y) => ({
      y,
      text: line
        .filter((cell) => cell.color === COLORS.red)
        .map((cell) => cell.char)
        .join('')
        .trim(),
    }))
    .filter((line) => line.text)
  expect(errors.length).toBeGreaterThanOrEqual(3)
  expect(errors.at(-1)?.text.endsWith('…')).toBe(true)
  expect(errors.every((line) => line.y < retry.y)).toBe(true)
  expect(hit(frame, retry.x, retry.y)?.id).toBe('guide-configure')
})
