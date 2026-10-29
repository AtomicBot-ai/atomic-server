import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { useServiceStore } from '@/hooks/useServiceHub'
import { useStatusStore } from '@/stores/status-store'
import { FakeEventSource } from './fake-event-source'

// Node 25+ has its own `localStorage` global (unusable without `--localstorage-file`), and vitest
// keeps it over jsdom's. The browser code under test must see jsdom's storage on any Node.
declare const jsdom: { window: Window }
for (const name of ['localStorage', 'sessionStorage'] as const)
  Object.defineProperty(globalThis, name, { value: jsdom.window[name], configurable: true, writable: true })
// jsdom does no layout, so it has no `scrollIntoView`; the chat calls it to follow new messages.
Element.prototype.scrollIntoView ??= () => {}
// Nor does it play media: the first run's video card starts its clip on mount.
HTMLMediaElement.prototype.play = () => Promise.resolve()
HTMLMediaElement.prototype.pause = () => {}

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup()
  useStatusStore.getState().reset()
  useServiceStore.setState({ serviceHub: null })
  FakeEventSource.reset()
})
