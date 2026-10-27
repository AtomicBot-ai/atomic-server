/** What the UIs say of the hardware facts beyond what the core lists: Apple silicon's GPU. */

/**
 * Apple silicon has no GPU entry in the core's facts (the GPU shares the CPU's memory; Metal is what
 * llama.cpp and MLX use): the chip and its unified memory are the honest answer when the list is empty.
 */
export function appleSiliconGpu(info: unknown): string | undefined {
  const facts = (info ?? {}) as {
    os_type?: string
    cpu?: { name?: string; arch?: string }
    total_memory?: number
  }
  if (facts.os_type !== 'macos' || facts.cpu?.arch !== 'arm64') return undefined
  const memory = facts.total_memory ? `, ${Math.round(facts.total_memory / 1024)} GB unified memory` : ''
  return `${facts.cpu?.name ?? 'Apple silicon'} GPU (Metal)${memory}`
}
