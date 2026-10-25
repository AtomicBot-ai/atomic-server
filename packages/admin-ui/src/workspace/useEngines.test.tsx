/** The engines both UIs offer come from the core, in the app's order (spec server-engine-settings, «macOS»). */
import { renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { useEngines } from './useEngines'

const LINUX = ['llamacpp-upstream', 'llamacpp', 'foundry-local', 'tensorrt-llm', 'sglang', 'vllm']
const MAC = ['llamacpp-upstream', 'llamacpp', 'atomic-prism', 'mlx', 'foundry-local']
const order = async (registered: string[]) => {
  const { workspace } = workspaceFixture({ 'engines.list': enginesList(registered) })
  const { result } = renderHook(() => useEngines(workspace.execute))
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result.current.engines.map((e) => e.engine)
}

it('lists the engines the core registers, managed ones in the app’s order', async () => {
  expect(await order(LINUX)).toEqual([
    'llamacpp-upstream',
    'llamacpp',
    'vllm',
    'sglang',
    'tensorrt-llm',
    'foundry-local',
  ])
})

it('offers no managed engine on macOS, where the core registers none', async () => {
  const engines = await order(MAC)
  expect(engines).toContain('mlx')
  for (const id of ['vllm', 'sglang', 'tensorrt-llm']) expect(engines).not.toContain(id)
})
