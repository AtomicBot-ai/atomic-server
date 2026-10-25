import { expect, it } from 'vitest'
import { iconKeyLogoSrc, isMonochromeFamilyLogo, modelFamilyLogoSrc } from './model-logos'
it('keeps the family brand for a distilled or community-quantized model', () => {
  expect(modelFamilyLogoSrc('community/DeepSeek-R1-Distill-Qwen-32B-GGUF')).toContain('deepseek-color.svg')
  expect(modelFamilyLogoSrc('community/Qwen3.5-4B-Q4')).toContain('qwen-color.svg')
})
it('resolves catalog icon keys when model names do not contain their publisher', () => {
  expect(iconKeyLogoSrc('NVIDIA')).toContain('nvidia.svg')
  expect(iconKeyLogoSrc('unknown-brand')).toBeNull()
})
it('tints single-color marks while preserving colored logos', () => {
  expect(isMonochromeFamilyLogo(iconKeyLogoSrc('liquid')!)).toBe(true)
  expect(isMonochromeFamilyLogo(modelFamilyLogoSrc('Qwen3.5')!)).toBe(false)
})
