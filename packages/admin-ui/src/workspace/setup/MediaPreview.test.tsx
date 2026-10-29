import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaPreview } from './MediaPreview'

/** jsdom has no media playback: play and pause flip `paused` and say so. */
function fakePlayback() {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false })
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true })
    this.dispatchEvent(new Event('pause'))
  })
}

/** jsdom has no `matchMedia` either: answer the reduced-motion query. */
const reducedMotion = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    )
  )

describe('MediaPreview', () => {
  beforeEach(fakePlayback)
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the still for images, with no player controls', () => {
    reducedMotion(false)
    const { container } = render(<MediaPreview modality="image" />)
    const still = screen.getByRole('img', { name: 'A pearl robot with a mint-green face in a dark studio' })
    expect(still).toHaveAttribute('src', '/images/onboarding/robot-studio.webp')
    expect(container.querySelector('video')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(container).toHaveTextContent('Images')
  })

  it('plays a muted loop for video that pauses and resumes', () => {
    reducedMotion(false)
    const { container } = render(<MediaPreview modality="video" />)
    const video = container.querySelector('video')!
    expect(video).toHaveAttribute('aria-label', 'A pearl robot waves and smiles')
    expect(video.src).toContain('/images/onboarding/robot-wave.mp4')
    expect(video.poster).toContain('/images/onboarding/robot-studio.webp')
    expect(video.loop).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.paused).toBe(false)
    expect(container).toHaveTextContent('Video')

    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))
    expect(video.paused).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(video.paused).toBe(false)
  })

  it('stays on the first frame when the system asks for reduced motion', () => {
    reducedMotion(true)
    const { container } = render(<MediaPreview modality="video" />)
    expect(container.querySelector('video')!.paused).toBe(true)
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument()
  })

  it('plays the loop when the browser cannot answer the reduced-motion query', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { container } = render(<MediaPreview modality="video" />)
    expect(container.querySelector('video')!.paused).toBe(false)
    expect(screen.getByRole('button', { name: 'Pause video' })).toBeInTheDocument()
  })
})
