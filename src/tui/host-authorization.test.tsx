import { expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { Text, useApp, useInput } from 'ink'
import { fakeTerminal } from '../../test/helpers/fake-terminal.js'
import { runTui } from './run-tui.js'
import type { TuiDeps } from './controller.js'
import type { WorkspaceProps } from './workspace/WorkspaceApp.js'
import { createWorkspace } from './workspace/state.js'

vi.mock('./workspace/index.js', () => ({
  WorkspaceApp: (props: WorkspaceProps) => {
    const { exit } = useApp()
    useInput(() => {})
    useEffect(() => {
      if (!props.initialState) props.onHostStep?.('memory', createWorkspace('models'))
      exit()
    }, [exit, props])
    return <Text>{props.initialState ? 'Returned to models' : 'Authorizing'}</Text>
  },
}))

it('releases raw input before one privilege prompt and restores the workspace afterwards', async () => {
  const terminal = fakeTerminal()
  const raw = vi.spyOn(terminal.stdin, 'setRawMode')
  const authorizeHostStep = vi.fn(async () => {
    expect(raw.mock.calls.at(-1)).toEqual([false])
    expect(terminal.stdout.writes.join('')).toContain('\u001b[?1000l')
  })
  expect(
    await runTui({
      terminal: terminal.streams,
      deps: {} as TuiDeps,
      screen: 'models',
      color: false,
      dataFolder: '/unused',
      authorizeHostStep,
      waitForShutdown: () => new Promise(() => {}),
      root: { name: 'atc', summary: 'test' },
    })
  ).toBe(0)
  expect(authorizeHostStep).toHaveBeenCalledExactlyOnceWith('memory')
  expect(terminal.stdout.text()).toContain('Returned to models')
})
