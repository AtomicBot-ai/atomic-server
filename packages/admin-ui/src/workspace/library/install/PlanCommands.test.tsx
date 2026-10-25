import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlanCommands } from './PlanCommands'

afterEach(() => vi.restoreAllMocks())

const PREFIX = "atc --data-folder '/data'"
const plan = { digest: 'd1', model_id: 'org/model' }
const request = { model: 'org/model', file: 'model.Q4.gguf' }
const commands = () => screen.getAllByText(/control call|api start/).map((node) => node.textContent)

function show(over: Partial<Parameters<typeof PlanCommands>[0]> = {}) {
  const execute = vi.fn(async () => ({ command_prefix: PREFIX })) as never
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
  render(
    <PlanCommands
      execute={execute}
      plan={plan}
      request={request}
      gguf
      engine="llamacpp"
      blocked={false}
      {...over}
    />
  )
  return execute
}

it('lists the exact GGUF commands, in order, with the server’s own command prefix', async () => {
  const execute = show()
  await waitFor(() => expect(commands()).toHaveLength(7))
  expect(execute).toHaveBeenCalledWith('config.get')
  const install = JSON.stringify({
    plan_digest: 'd1',
    request_id: '00000000-0000-4000-8000-000000000001',
    request,
  })
  expect(commands()).toEqual([
    `${PREFIX} control call models.plan --input '${JSON.stringify(request)}' --json`,
    `${PREFIX} control call models.install --input '${install}' --json`,
    `${PREFIX} control call setup.status --json`,
    `${PREFIX} control call models.load --input '{"provider":"llamacpp","model_id":"org/model"}' --json`,
    `${PREFIX} api start`,
    `${PREFIX} control call api.ping --json`,
    `${PREFIX} control call setup.complete --input '{"model_id":"org/model"}' --json`,
  ])
  expect(screen.getAllByRole('button', { name: /Copy command/ })).toHaveLength(7)
})

it('uses the artifact operations for a non-GGUF model and explains how to load it', async () => {
  show({ gguf: false, plan: { plan_digest: 'p2', model_id: 'org/mlx' } })
  await waitFor(() => expect(commands()).toHaveLength(6))
  expect(commands()[0]).toContain('control call artifacts.plan')
  expect(commands()[1]).toBe(
    `${PREFIX} control call artifacts.install --input '{"plan_digest":"p2","request_id":"00000000-0000-4000-8000-000000000001"}' --json`
  )
  expect(commands()[2]).toBe(`${PREFIX} control call artifacts.list --json`)
  expect(screen.getByText(/load it with artifacts.load/)).toBeInTheDocument()
})

it('quotes a single quote inside the input for the shell', async () => {
  show({ request: { model: "it's" } })
  await waitFor(() => expect(commands().length).toBeGreaterThan(0))
  expect(commands()[0]).toBe(`${PREFIX} control call models.plan --input '{"model":"it'\\''s"}' --json`)
})

it('shows no commands while a blocker stands', async () => {
  const execute = show({ blocked: true })
  await waitFor(() => expect(execute).toHaveBeenCalled())
  expect(screen.getByText(/Resolve the engine or compatibility blocker/)).toBeInTheDocument()
  expect(screen.queryByText(/control call/)).toBeNull()
})

it('says why when the server’s command prefix cannot be read', async () => {
  const execute = vi.fn(async () => {
    throw new Error('offline')
  }) as never
  render(
    <PlanCommands execute={execute} plan={plan} request={request} gguf engine="llamacpp" blocked={false} />
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  expect(screen.queryByText(/control call/)).toBeNull()
})
