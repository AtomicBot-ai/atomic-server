// Lifted from Atomic-Chat/web-app/src/lib/utils.ts @ 1c01e2a; adapted: bundled provider logo URLs.
import openai from './provider-logos/openai.svg'
import anthropic from './provider-logos/anthropic.svg'
import google from './provider-logos/gemini.svg'
import openrouter from './provider-logos/open-router.svg'
import chatgpt from './provider-logos/codex.svg'
import deepseek from './provider-logos/deepseek.svg'
import xai from './provider-logos/xai.svg'
import groq from './provider-logos/groq.svg'
import mistral from './provider-logos/mistral.svg'
import llamacpp from './provider-logos/llamacpp.svg'
import automatic1111 from './provider-logos/automatic1111.svg'
import sdcpp from './provider-logos/sdcpp-server.png'
import azure from './provider-logos/azure.svg'
const logos: Record<string, string> = {
  openai,
  anthropic,
  google,
  openrouter,
  chatgpt,
  deepseek,
  xai,
  groq,
  mistral,
  azure,
  'llamacpp-server': llamacpp,
  automatic1111,
  'sdcpp-server': sdcpp,
}
export function CloudProviderMark({ provider }: { provider: string }) {
  return logos[provider] ? (
    <img className="cloud-provider-icon" src={logos[provider]} alt="" draggable={false} />
  ) : (
    <span className="cloud-provider-icon" aria-hidden="true">
      +
    </span>
  )
}
