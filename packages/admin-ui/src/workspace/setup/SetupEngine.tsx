import { useState } from 'react'
import { engineName } from '@view'
import { useEngines } from '../useEngines'
import { Action, Field } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { record, text } from '../types'
import type { RecordValue } from '../types'

/** What each engine is for; its name and whether it exists here are the core's answer. */
const LABELS: Record<string, string> = {
  'llamacpp-upstream': 'standard GGUF models',
  'llamacpp': 'GGUF models with additional tuning',
  'atomic-prism': 'models that require Prism',
  'mlx': 'Apple Silicon models',
  'sd-cpp': 'image and video models',
  'vllm': 'safetensors models in a container (NVIDIA)',
  'sglang': 'safetensors models in a container (NVIDIA)',
  'tensorrt-llm': 'safetensors and NVFP4 models in a container (NVIDIA)',
  'foundry-local': 'ONNX models on the NPU, GPU or CPU',
  'litert-lm': '.litertlm models on the CPU, GPU or an Intel NPU',
}
export function SetupEngine({
  workspace: w,
  category,
  engine,
  setEngine,
  onContinue,
}: {
  workspace: Workspace
  category: string
  engine: string
  setEngine: (value: string) => void
  onContinue: () => void
}) {
  const [revision, setRevision] = useState(0)
  const { engines, loading, error } = useEngines(w.execute, revision)
  const choices = engines.filter((entry) => {
    const id = text(entry.engine)
    if (category === 'image' || category === 'video') return id === 'sd-cpp'
    if (category === 'decision') return id === 'llamacpp'
    if (category === 'embedding') return ['llamacpp-upstream', 'llamacpp'].includes(id)
    // Chat engines: llama.cpp's family, MLX, the managed engines, Foundry Local and LiteRT-LM (by the core's kind).
    return text(entry.kind) !== 'engine-build' || ['mlx', 'foundry-local', 'litert-lm'].includes(id)
  })
  const selected = choices.find((entry) => entry.engine === engine)
  const available = (entry: RecordValue) => Boolean(entry.active || entry.latest)
  return (
    <>
      <Field
        label="1. Choose an engine"
        hint="An engine runs the model for your agent. Start with standard llama.cpp for GGUF models; the file review checks exact compatibility."
      >
        <select
          aria-label="Setup engine"
          value={engine}
          disabled={loading}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="">{loading ? 'Checking engines for this computer…' : 'Choose an engine'}</option>
          {choices.map((entry) => (
            <option key={text(entry.engine)} value={text(entry.engine)} disabled={!available(entry)}>
              {engineName(text(entry.engine))}
              {LABELS[text(entry.engine)] ? ` — ${LABELS[text(entry.engine)]}` : ''}
              {available(entry) ? '' : ' · unavailable on this computer'}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (!choices.length || error) && (
        <Action onClick={() => setRevision((v) => v + 1)}>Retry engines</Action>
      )}
      {selected && (
        <p className="ew-muted">
          {selected.active ? 'Installed build' : 'Offered build'}:{' '}
          {text(record(selected.active ?? selected.latest).version)}. Model compatibility is checked before
          download.
        </p>
      )}
      <Action primary disabled={loading || !selected || !available(selected)} onClick={onContinue}>
        Choose models for this engine
      </Action>
    </>
  )
}
