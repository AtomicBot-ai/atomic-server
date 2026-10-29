// Lifted from Atomic-Chat/web-app/src/containers/onboarding/steps/MediaPreview.tsx @ 2d0323463; adapted: English strings inlined (no i18n), `first-media-*` class names, a missing `matchMedia` reads as no reduced-motion preference.
import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Pause, Play, Video } from 'lucide-react'
import './media-preview.css'

const STILL = '/images/onboarding/robot-studio.webp'
const CLIP = '/images/onboarding/robot-wave.mp4'

/**
 * The top of a media card: the same robot as a still for images and as a
 * short muted loop for video, with the kind named in the corner. The loop
 * plays on its own unless the system asks for reduced motion, and its button
 * pauses and resumes it either way.
 */
export function MediaPreview({ modality }: { modality: 'image' | 'video' }) {
  const video = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(true)
  const animated = modality === 'video'

  useEffect(() => {
    if (!animated) return
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => {
      if (preference?.matches) video.current?.pause()
      else void video.current?.play()?.catch(() => setPaused(true))
    }
    update()
    preference?.addEventListener('change', update)
    return () => preference?.removeEventListener('change', update)
  }, [animated])

  const toggle = () => {
    const element = video.current
    if (!element) return
    if (element.paused) void element.play().catch(() => setPaused(true))
    else element.pause()
  }

  return (
    <div className="first-media-scene">
      <span className="first-media-kind" aria-hidden="true">
        {animated ? <Video size={14} /> : <ImageIcon size={14} />}
        {animated ? 'Video' : 'Images'}
      </span>
      {animated ? (
        <video
          ref={video}
          className="first-media-art"
          src={CLIP}
          poster={STILL}
          aria-label="A pearl robot waves and smiles"
          muted
          loop
          playsInline
          preload="auto"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      ) : (
        <img
          className="first-media-art"
          src={STILL}
          alt="A pearl robot with a mint-green face in a dark studio"
        />
      )}
      {animated && (
        <button
          type="button"
          className="first-media-toggle"
          aria-label={paused ? 'Play video' : 'Pause video'}
          onClick={toggle}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      )}
    </div>
  )
}
