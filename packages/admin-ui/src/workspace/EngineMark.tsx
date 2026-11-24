// Lifted from Atomic-Chat/web-app/src/lib/utils.ts and containers/server/ServerPageParts.tsx @ 07e4b8737; adapted: server assets and theme.
import { engineName } from '@view'
import './styles/engine-mark.css'

const engineLogos: Record<string, string> = {
  'llamacpp-upstream': '/engine-brands/llamacpp.svg',
  'llamacpp-server': '/engine-brands/llamacpp.svg',
  'llamacpp': '/engine-brands/llamacpp.svg',
  'mlx': '/engine-brands/mlx.png',
  'atomic-prism': '/model-brands/images/model-provider/prism-ml.webp',
  'tensorrt-llm': '/model-brands/images/model-provider/nvidia.svg',
  'vllm': '/engine-brands/vllm.svg',
  'sglang': '/engine-brands/sglang.svg',
  'foundry-local': '/engine-brands/foundry-local.svg',
  'litert-lm': '/engine-brands/litert-lm.svg',
  'geniex': '/engine-brands/geniex.svg',
  'fastflowlm': '/engine-brands/fastflowlm.svg',
}

export function EngineMark({ engine }: { engine: string }) {
  const src = engineLogos[engine]
  const monochrome = engine === 'atomic-prism' || src === '/engine-brands/llamacpp.svg'
  return (
    <span className="engine-mark" aria-hidden="true">
      {src ? (
        <img className={monochrome ? 'monochrome' : undefined} src={src} alt="" />
      ) : (
        <span>{engineName(engine).charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}
