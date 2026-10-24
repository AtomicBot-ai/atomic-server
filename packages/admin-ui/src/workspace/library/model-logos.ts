// Lifted from Atomic-Chat/web-app/src/lib/model-logo.ts @ 5043013; adapted: server catalog logo resolution and bundled asset paths.
// Bundled brand logos served from web-app/public. Matching is done on the model
// *family*, so a community quant (e.g. a Gemma repack by some user) still shows
// the recognizable brand mark instead of the quantizer's avatar or a letter.
// To add a brand: drop an SVG/PNG in web-app/public and append a rule. Order
// matters — more specific families first (e.g. deepseek before qwen, since
// "DeepSeek-R1-Distill-Qwen" should resolve to DeepSeek).
const FAMILY_LOGO_RULES: Array<[RegExp, string]> = [
  // Image and video models of cloud and self-hosted providers (remote media), ahead of the chat
  // families so `google/veo-3.1` or `minimax/hailuo-3` find their own mark. Marks from
  // @lobehub/icons-static-svg 1.95.1, except HiDream (its Hugging Face organisation avatar) and
  // HeyGen (its site favicon), which that set lacks.
  [/nano-?banana|gemini-[\d.]+-(?:flash|pro)(?:-lite)?-image/i, '/model-brands/svg/nanobanana-color.svg'],
  [/\bveo[-_ ]?\d|\bimagen/i, '/model-brands/svg/google-color.svg'],
  [/\bsora\b|sora-\d/i, '/model-brands/svg/sora-color.svg'],
  [/dall-?e/i, '/model-brands/svg/dalle-color.svg'],
  [/gpt-image|chatgpt-image|gpt-[\d.]+-image/i, '/model-brands/svg/openai-mark.svg'],
  [/grok-imagine/i, '/model-brands/images/model-provider/xai.svg'],
  [/seedream|seedance|dreamina/i, '/model-brands/svg/bytedance-color.svg'],
  [/kling|kwaivgi/i, '/model-brands/svg/kling-color.svg'],
  [/hailuo/i, '/model-brands/svg/hailuo-color.svg'],
  [/\bimage-01\b|minimax-h\d/i, '/model-brands/svg/minimax.svg'],
  [/runway|\bgen-4|\baleph-\d/i, '/model-brands/svg/runway.svg'],
  [/\bluma\b|luma\/|\bray-\d/i, '/model-brands/svg/luma.svg'],
  [/\bpika/i, '/model-brands/svg/pika.svg'],
  [/ideogram/i, '/model-brands/svg/ideogram.svg'],
  [/recraft/i, '/model-brands/svg/recraft.svg'],
  [/hunyuan|\bhy-image/i, '/model-brands/svg/hunyuan-color.svg'],
  [/\bvidu/i, '/model-brands/svg/vidu-color.svg'],
  [/pixverse/i, '/model-brands/svg/pixverse-color.svg'],
  [/happyhorse/i, '/model-brands/svg/happyhorse.svg'],
  [/hidream/i, '/model-brands/svg/hidream.webp'],
  [/heygen|avatar-iv/i, '/model-brands/svg/heygen.png'],
  [/^krea\//i, '/model-brands/svg/krea.svg'],
  [/mai-image/i, '/model-brands/svg/microsoft-color.svg'],
  [/ming-image|inclusionai/i, '/model-brands/images/model-provider/inclusionai.webp'],
  [
    /stable[-_ ]?diffusion|stable-image|stability|\bsd[_-]?xl|sdxl|\bsd[_-]?3|\bsd[_-]?1\.?5|v1-5-pruned|\bsd-turbo/i,
    '/model-brands/svg/stability-color.svg',
  ],
  [/deepseek/i, '/model-brands/svg/deepseek-color.svg'],
  // EmbeddingGemma carries the Gemma mark itself, not Google's "G".
  [/embeddinggemma/i, '/model-brands/svg/gemma-color.svg'],
  [/gemma/i, '/model-brands/svg/google-color.svg'],
  [/\bglm\b|chatglm/i, '/model-brands/svg/zai.svg'],
  [/bonsai/i, '/model-brands/images/model-provider/prism-ml.webp'],
  [/ornith/i, '/model-brands/images/model-provider/ornith.webp'],
  [/\bling\b/i, '/model-brands/images/model-provider/ling.webp'],
  [/qwen|qwq/i, '/model-brands/svg/qwen-color.svg'],
  [/(?<!o)llama/i, '/model-brands/svg/meta-color.svg'],
  [/\bmuse-(spark|glimmer|image)/i, '/model-brands/svg/meta-color.svg'],
  [
    /mi[sx]tral|magistral|ministral|codestral|devstral|voxtral/i,
    '/model-brands/images/model-provider/mistral.svg',
  ],
  [/minimax/i, '/model-brands/svg/minimax.svg'],
  [/lfm/i, '/model-brands/svg/liquid.svg'],
  [/nemotron/i, '/model-brands/images/model-provider/nvidia.svg'],
  [/gpt-oss/i, '/model-brands/svg/openai-mark.svg'],
  [/granite/i, '/model-brands/svg/ibm.svg'],
  // Embedding models: BAAI's bge family and Nomic's embed models.
  [/\bbge\b|bge-/i, '/model-brands/svg/baai.svg'],
  [/nomic/i, '/model-brands/images/model-provider/nomic.svg'],
  [/olmo/i, '/model-brands/svg/ai2-color.svg'],
  [/hermes/i, '/model-brands/svg/nousresearch.svg'],
  [/seed-oss/i, '/model-brands/svg/bytedance-color.svg'],
  [/laguna/i, '/model-brands/svg/poolside-color.svg'],
  [/\brnj\b/i, '/model-brands/svg/essentialai-color.svg'],
  [/\bphi-?\d/i, '/model-brands/svg/microsoft-color.svg'],
  // Image and video checkpoints. Z-Image is from Tongyi-MAI, not the Qwen
  // model family, so it has its own mark rather than inheriting Qwen.
  [/\bz[- ]?image/i, '/model-brands/svg/z-image.svg'],
  [/\bflux[.-]?\d/i, '/model-brands/svg/bfl.svg'],
  // Krea has no mark of its own here; Krea 2 is drawn like FLUX.1 Krea, as its
  // family id's icon key (`bfl`) already has it.
  [/\bkrea[- ]?2\b/i, '/model-brands/svg/bfl.svg'],
  // `Wan2.2-TI2V-5B` on the Hub, `Wan 2.2 TI2V 5B` in the catalog.
  [/\bwan[- ]?\d/i, '/model-brands/svg/qwen-color.svg'],
  [/\bltx-?(video|\d)/i, '/model-brands/svg/lightricks.svg'],
]

// Single-color brand marks (drawn with `fill="currentColor"`, or a raster
// mark in one dark color on transparency like PrismML's). They must be
// tinted with the current text color rather than rendered as a plain <img>,
// otherwise a black-on-transparent mark vanishes on dark backgrounds. See
// ModelLogo's CSS-mask render path.
const MONOCHROME_FAMILY_LOGOS: ReadonlySet<string> = new Set([
  '/model-brands/images/model-provider/prism-ml.webp',
  '/model-brands/svg/liquid.svg',
  '/model-brands/svg/ibm.svg',
  '/model-brands/svg/baai.svg',
  '/model-brands/svg/nousresearch.svg',
  '/model-brands/svg/zai.svg',
  '/model-brands/svg/minimax.svg',
  '/model-brands/svg/bfl.svg',
  '/model-brands/svg/lightricks.svg',
  '/model-brands/svg/openai-mark.svg',
  '/model-brands/svg/z-image.svg',
  // Remote media marks drawn in one color.
  '/model-brands/svg/runway.svg',
  '/model-brands/svg/luma.svg',
  '/model-brands/svg/pika.svg',
  '/model-brands/svg/ideogram.svg',
  '/model-brands/svg/recraft.svg',
  '/model-brands/svg/krea.svg',
  '/model-brands/svg/happyhorse.svg',
  '/model-brands/images/model-provider/xai.svg',
])

// Explicit icon keys addressable from the staff-picks manifest. Curators pick
// the mark by name instead of relying on the repo id matching a family regex,
// which breaks as soon as a repo is renamed.
const ICON_KEY_LOGOS: Readonly<Record<string, string>> = {
  'deepseek': '/model-brands/svg/deepseek-color.svg',
  'gemma': '/model-brands/svg/google-color.svg',
  'gemma-mark': '/model-brands/svg/gemma-color.svg',
  'google': '/model-brands/svg/google-color.svg',
  'glm': '/model-brands/svg/zai.svg',
  'qwen': '/model-brands/svg/qwen-color.svg',
  'llama': '/model-brands/svg/meta-color.svg',
  'meta': '/model-brands/svg/meta-color.svg',
  'muse': '/model-brands/svg/meta-color.svg',
  'mistral': '/model-brands/images/model-provider/mistral.svg',
  'lfm': '/model-brands/svg/liquid.svg',
  'liquid': '/model-brands/svg/liquid.svg',
  'minimax': '/model-brands/svg/minimax.svg',
  'nvidia': '/model-brands/images/model-provider/nvidia.svg',
  'openai': '/model-brands/svg/openai-mark.svg',
  'ibm': '/model-brands/svg/ibm.svg',
  // BAAI (bge) from @lobehub/icons-static-svg 1.95.1; Nomic's own favicon mark,
  // a black N on its white square, which reads on either theme as it is.
  'baai': '/model-brands/svg/baai.svg',
  'nomic': '/model-brands/images/model-provider/nomic.svg',
  'allenai': '/model-brands/svg/ai2-color.svg',
  'nous': '/model-brands/svg/nousresearch.svg',
  'bytedance': '/model-brands/svg/bytedance-color.svg',
  'poolside': '/model-brands/svg/poolside-color.svg',
  'essentialai': '/model-brands/svg/essentialai-color.svg',
  'microsoft': '/model-brands/svg/microsoft-color.svg',
  'prism': '/model-brands/images/model-provider/prism-ml.webp',
  'ling': '/model-brands/images/model-provider/ling.webp',
  'inclusionai': '/model-brands/images/model-provider/inclusionai.webp',
  'nanbeige': '/model-brands/images/model-provider/nanbeige.webp',
  'ornith': '/model-brands/images/model-provider/ornith.webp',
  'convai': '/model-brands/images/model-provider/convai.webp',
  // Decision model makers (atomic-chat-conf models/decision.json `icon`).
  'supersonic': '/model-brands/images/model-provider/supersonic.webp',
  'interfaze': '/model-brands/images/model-provider/interfaze.webp',
  'bespoke': '/model-brands/images/model-provider/bespoke.webp',
  'cloudflare': '/model-brands/images/model-provider/cloudflare.webp',
  'openjev': '/model-brands/images/model-provider/openjev.webp',
  'bfl': '/model-brands/svg/bfl.svg',
  'flux': '/model-brands/svg/bfl.svg',
  'tongyi': '/model-brands/svg/qwen-color.svg',
  'wan': '/model-brands/svg/qwen-color.svg',
  'lightricks': '/model-brands/svg/lightricks.svg',
  'ltx': '/model-brands/svg/lightricks.svg',
  'z-image': '/model-brands/svg/z-image.svg',
  'huggingface': '/model-brands/images/model-provider/huggingface.svg',
}

/** The Hugging Face mark, used as the neutral avatar for long-tail results. */
export const HUGGINGFACE_LOGO_SRC = ICON_KEY_LOGOS.huggingface

export function modelFamilyLogoSrc(modelName?: string): string | null {
  if (!modelName) return null
  for (const [pattern, src] of FAMILY_LOGO_RULES) {
    if (pattern.test(modelName)) return src
  }
  return null
}

/** Resolve a manifest `icon` key. Unknown keys fall through to the caller. */
export function iconKeyLogoSrc(iconKey?: string): string | null {
  if (!iconKey) return null
  return ICON_KEY_LOGOS[iconKey.toLowerCase()] ?? null
}

export function isMonochromeFamilyLogo(src: string): boolean {
  return MONOCHROME_FAMILY_LOGOS.has(src)
}
