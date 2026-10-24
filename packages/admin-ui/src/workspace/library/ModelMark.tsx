// Lifted from Atomic-Chat/web-app/src/containers/ModelLogo.tsx @ 5043013; adapted: server model metadata and native CSS.
import { useState } from 'react'
import {
  HUGGINGFACE_LOGO_SRC,
  iconKeyLogoSrc,
  isMonochromeFamilyLogo,
  modelFamilyLogoSrc,
} from './model-logos'
import { record, text } from '../types'
import type { RecordValue } from '../types'
export function ModelMark({ model }: { model: RecordValue }) {
  const [failed, setFailed] = useState(false)
  const source = record(model.source)
  const name = text(model.name ?? model.title ?? model.id ?? model.model_id, '')
  const src =
    iconKeyLogoSrc(text(source.icon ?? model.icon, '')) ?? modelFamilyLogoSrc(name) ?? HUGGINGFACE_LOGO_SRC
  return (
    <span className="hub-model-mark" aria-hidden="true">
      {failed ? (
        name.charAt(0)
      ) : isMonochromeFamilyLogo(src) ? (
        <span
          style={{
            width: 22,
            height: 22,
            background: 'currentColor',
            mask: `url(${src}) center / contain no-repeat`,
            WebkitMask: `url(${src}) center / contain no-repeat`,
          }}
        />
      ) : (
        <img src={src} alt="" draggable={false} width={24} height={24} onError={() => setFailed(true)} />
      )}
    </span>
  )
}
